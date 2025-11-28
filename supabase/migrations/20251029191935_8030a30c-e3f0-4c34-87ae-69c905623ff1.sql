-- Tornar o bucket photos público para facilitar acesso às imagens
UPDATE storage.buckets SET public = true WHERE id = 'photos';

-- Criar políticas para permitir upload de fotos (público para teste)
CREATE POLICY "Permitir upload público de fotos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'photos');

-- Permitir leitura pública das fotos
CREATE POLICY "Permitir leitura pública de fotos"
ON storage.objects FOR SELECT
USING (bucket_id = 'photos');

-- Permitir deletar fotos publicamente (para teste)
CREATE POLICY "Permitir delete público de fotos"
ON storage.objects FOR DELETE
USING (bucket_id = 'photos');