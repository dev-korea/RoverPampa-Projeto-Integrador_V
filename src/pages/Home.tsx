import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Navigation as NavIcon, Image as ImageIcon, Bot, Bluetooth, CheckCircle2 } from 'lucide-react';
import { useBLE } from '@/hooks/useBLE';
import { BluetoothConnect } from '@/components/BluetoothConnect';
import { useState } from 'react';

interface HomeProps {
  bleService: ReturnType<typeof useBLE>;
}

const Home = ({ bleService }: HomeProps) => {
  const navigate = useNavigate();
  const [connectSheetOpen, setConnectSheetOpen] = useState(false);
  const { state, connectedDevice } = bleService;
  
  const isConnected = state === 'connected';

  const missionCards = [
    {
      id: 'manual',
      title: 'Missão Manual',
      description: 'Controle direto do rover com captura de fotos manual',
      icon: NavIcon,
      path: '/manual-mission',
      gradient: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-500',
      borderColor: 'border-blue-500/20 hover:border-blue-500/40',
    },
    {
      id: 'autonomous',
      title: 'Missão Autônoma',
      description: 'Deixe o rover explorar e capturar fotos automaticamente',
      icon: Bot,
      path: '/autonomous-mission',
      gradient: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-500',
      borderColor: 'border-purple-500/20 hover:border-purple-500/40',
    },
    {
      id: 'missions',
      title: 'Ver Missões',
      description: 'Acesse todas as missões e fotos organizadas por pasta',
      icon: ImageIcon,
      path: '/missions',
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconColor: 'text-green-500',
      borderColor: 'border-green-500/20 hover:border-green-500/40',
    },
  ];

  return (
    <div className="min-h-screen bg-background p-4 pt-6 pb-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold">ROVER PAMPA</h1>
          <p className="text-muted-foreground">
            Sistema de Controle e Exploração
          </p>
        </div>

        {/* Bluetooth Connection Card */}
        <Card className={`p-4 ${isConnected ? 'bg-success/10 border-success/20' : 'bg-muted/30'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isConnected ? 'bg-success/20' : 'bg-muted'}`}>
                <Bluetooth className={`w-5 h-5 ${isConnected ? 'text-success' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium">
                  {isConnected ? connectedDevice?.name || 'ROVER PAMPA' : 'Bluetooth'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isConnected ? 'Conectado e pronto' : 'Conecte-se ao rover para começar'}
                </p>
              </div>
              {isConnected && (
                <CheckCircle2 className="w-5 h-5 text-success ml-2" />
              )}
            </div>
            <Button
              onClick={() => setConnectSheetOpen(true)}
              variant={isConnected ? "outline" : "default"}
              size="sm"
            >
              <Bluetooth className="w-4 h-4 mr-2" />
              {isConnected ? 'Reconectar' : 'Conectar'}
            </Button>
          </div>
        </Card>

        {/* Mission Cards */}
        <div className="grid gap-6">
          {missionCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.id}
                className={`p-6 bg-gradient-to-br ${card.gradient} border-2 ${card.borderColor} cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]`}
                onClick={() => navigate(card.path)}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-4 rounded-xl bg-background/80 backdrop-blur shadow-lg`}>
                    <Icon className={`w-8 h-8 ${card.iconColor}`} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-2">{card.title}</h2>
                    <p className="text-muted-foreground text-sm">{card.description}</p>
                  </div>
                  <div className="self-center">
                    <NavIcon className="w-5 h-5 rotate-180 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Info */}
        <Card className="p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground text-center">
            {isConnected 
              ? 'Rover conectado! Escolha uma missão acima para começar' 
              : 'Conecte-se ao rover via Bluetooth para iniciar as missões'}
          </p>
        </Card>
      </div>

      {/* Bluetooth Connection Dialog */}
      <BluetoothConnect
        bleService={bleService}
        open={connectSheetOpen}
        onOpenChange={setConnectSheetOpen}
      />
    </div>
  );
};

export default Home;
