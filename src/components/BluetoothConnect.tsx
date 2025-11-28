import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useBLE } from '@/hooks/useBLE';
import { Loader2, Radio } from 'lucide-react';

interface BluetoothConnectProps {
  bleService: ReturnType<typeof useBLE>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BluetoothConnect = ({ bleService, open, onOpenChange }: BluetoothConnectProps) => {
  const {
    state,
    devices,
    error,
    scanForDevices,
    connect,
    clearError,
    requestPermissions,
  } = bleService;

  const handleScan = async (showAll: boolean = false) => {
    clearError();
    // Request permissions first
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) return;
    
    // Scan for ESP32-CAR (prefix "ESP32" catches "ESP32-CAR")
    await scanForDevices('ESP32', false, showAll);
  };

  const handleConnect = async (device: any) => {
    await connect(device.device);
    if (state === 'connected') {
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Conectar ao ROVER PAMPA</SheetTitle>
          <SheetDescription>
            Procure por dispositivos ROVER PAMPA próximos e conecte via Bluetooth
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Error Message */}
          {error && (
            <Card className="p-4 bg-destructive/10 border-destructive">
              <p className="text-destructive text-sm">{error}</p>
            </Card>
          )}

          {/* Scan Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => handleScan(false)}
              disabled={state === 'scanning' || state === 'connecting'}
              className="flex-1 h-12 text-lg font-semibold"
            >
              {(state === 'scanning' || state === 'connecting') && (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              )}
              {state === 'scanning' ? 'Procurando...' : 'Procurar Rover'}
            </Button>
            
            <Button
              onClick={() => handleScan(true)}
              disabled={state === 'scanning' || state === 'connecting'}
              variant="outline"
              className="h-12"
            >
              Todos
            </Button>
          </div>

          {state === 'scanning' && (
            <p className="text-xs text-center text-muted-foreground animate-pulse">
              Procurando por 15 segundos... Certifique-se de que seu dispositivo está próximo e ligado
            </p>
          )}

          {/* Device List */}
          {devices.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Dispositivos Disponíveis</h3>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {devices.map((device, index) => (
                  <Card
                    key={index}
                    className="p-4 cursor-pointer hover:bg-card/80 transition-all hover:shadow-control-glow"
                    onClick={() => handleConnect(device)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Radio className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">{device.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {device.device.deviceId}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-primary">
                          {device.rssi} dBm
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {device.rssi > -60 ? 'Forte' : device.rssi > -80 ? 'Bom' : 'Fraco'}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
