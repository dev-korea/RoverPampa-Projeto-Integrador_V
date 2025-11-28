import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GalleryPhoto {
  id: string;
  filename: string;
  file_path: string;
  file_size: number;
  capture_at: string;
  created_at: string;
  publicUrl: string;
  mission_id: string | null;
  user_id?: string;
  // Campos para fotos locais
  isLocal?: boolean;
  dataUrl?: string;
  telemetry?: any;
}

export const useGallery = (missionId?: string | null) => {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Buscar fotos da tabela (remotas)
      let query = supabase
        .from('photos')
        .select('*');

      if (missionId) {
        query = query.eq('mission_id', missionId);
      }

      const { data, error: fetchError } = await query
        .order('capture_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      const remotePhotos: GalleryPhoto[] = await Promise.all((data || []).map(async (photo) => {
        const resolvedPath = photo.file_path || `${photo.user_id || 'public'}/${photo.mission_id || 'nomission'}/${photo.filename}`;
        // Tenta URL assinada; se não disponível (bucket público), cai para getPublicUrl
        const { data: signed } = await supabase.storage
          .from('photos')
          .createSignedUrl(resolvedPath, 60 * 60);
        const { data: publicData } = supabase.storage
          .from('photos')
          .getPublicUrl(resolvedPath);
        const url = signed?.signedUrl || publicData.publicUrl;

        return {
          ...photo,
          file_path: resolvedPath,
          publicUrl: url,
          isLocal: false,
        } as GalleryPhoto;
      }));

      // Buscar fotos locais do localStorage
      const stored = localStorage.getItem('roverpampa_photos');
      const localRaw = stored ? JSON.parse(stored) : [];
      const localPhotos: GalleryPhoto[] = localRaw
        .filter((p: any) => !missionId || p.missionId === missionId)
        .map((p: any) => ({
          id: p.id,
          filename: p.filename,
          file_path: '',
          file_size: p.size,
          capture_at: p.createdAt,
          created_at: p.createdAt,
          publicUrl: p.dataUrl,
          mission_id: p.missionId || null,
          isLocal: true,
          dataUrl: p.dataUrl,
          telemetry: p.telemetry || null,
        }));

      // Mesclar locais e remotas (ordenar por capture_at desc)
      const allPhotos = [...localPhotos, ...remotePhotos].sort(
        (a, b) => new Date(b.capture_at).getTime() - new Date(a.capture_at).getTime()
      );

      setPhotos(allPhotos);
    } catch (err) {
      console.error('Erro ao carregar fotos:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar fotos');
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  const deletePhoto = useCallback(async (photoId: string, filePath: string, isLocal?: boolean) => {
    try {
      if (isLocal) {
        // Remover do localStorage
        const stored = localStorage.getItem('roverpampa_photos');
        const list = stored ? JSON.parse(stored) : [];
        const updated = list.filter((p: any) => p.id !== photoId);
        localStorage.setItem('roverpampa_photos', JSON.stringify(updated));
        setPhotos(prev => prev.filter(p => p.id !== photoId));
        return;
      }

      // Deletar do storage remoto
      const { error: storageError } = await supabase.storage
        .from('photos')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Deletar da tabela
      const { error: dbError } = await supabase
        .from('photos')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;

      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (err) {
      console.error('Erro ao deletar foto:', err);
      throw err;
    }
  }, []);

  const movePhotoToMission = useCallback(async (photoId: string, newMissionId: string | null) => {
    // Suporta apenas fotos locais por enquanto
    const stored = localStorage.getItem('roverpampa_photos');
    const list = stored ? JSON.parse(stored) : [];
    const updated = list.map((p: any) => p.id === photoId ? { ...p, missionId: newMissionId } : p);
    localStorage.setItem('roverpampa_photos', JSON.stringify(updated));
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, mission_id: newMissionId } : p));
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos, missionId]);

  useEffect(() => {
    const onUpdated = (e: any) => {
      const targetMission = e?.detail?.missionId || null;
      if (!missionId || missionId === targetMission) {
        loadPhotos();
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'roverpampa_photos') {
        loadPhotos();
      }
    };
    window.addEventListener('photos-updated', onUpdated as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('photos-updated', onUpdated as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [loadPhotos, missionId]);

  return {
    photos,
    loading,
    error,
    loadPhotos,
    deletePhoto,
    movePhotoToMission,
  };
};
