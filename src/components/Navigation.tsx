import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bluetooth, BellOff, FolderOpen, Home } from 'lucide-react';
import { useBLE } from '@/hooks/useBLE';
import { useState } from 'react';
import { BluetoothConnect } from './BluetoothConnect';

interface NavigationProps {
  bleService: ReturnType<typeof useBLE>;
}

export const Navigation = ({ bleService }: NavigationProps) => {
  const location = useLocation();
  const [connectSheetOpen, setConnectSheetOpen] = useState(false);
  const { state, connectedDevice, disconnect } = bleService;

  const isConnected = state === 'connected';
  const showNav = location.pathname !== '/';

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/missions', icon: FolderOpen, label: 'Missões' },
  ];

  const handleDisconnect = async () => {
    await disconnect();
  };

  return (
    <>
      {showNav && (
        <div className="sticky top-0 z-50 bg-card/80 backdrop-blur border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">
                {connectedDevice?.name || 'ROVER PAMPA'}
              </span>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-success' : 'bg-muted'
              }`} />
            </div>
            
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  className="h-7 text-xs"
                >
                  <BellOff className="w-3 h-3 mr-1" />
                  Desconectar
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConnectSheetOpen(true)}
                  className="h-7 text-xs"
                >
                  <Bluetooth className="w-3 h-3 mr-1" />
                  Conectar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNav && (
        <div className="bg-background/80 backdrop-blur">
          <div className="max-w-4xl mx-auto px-4 py-3 flex justify-center">
            <div className="flex items-center justify-center gap-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                const baseClasses = "rounded-full transition-all duration-200 flex items-center gap-3";
                const activeClasses = "h-12 px-6 text-base bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]";
                const inactiveClasses = "h-12 px-6 text-base bg-muted text-muted-foreground ring-1 ring-border/40 hover:bg-muted/70 hover:text-foreground hover:scale-[1.02] active:scale-[0.98]";
                return (
                  <Link key={item.path} to={item.path}>
                    <Button
                      variant="ghost"
                      className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-semibold text-base">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <BluetoothConnect open={connectSheetOpen} onOpenChange={setConnectSheetOpen} bleService={bleService} />
    </>
  );
};
