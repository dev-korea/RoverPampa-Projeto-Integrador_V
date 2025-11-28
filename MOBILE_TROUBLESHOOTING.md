# 📱 Guia de Solução de Problemas - Mobile

## ✅ Problemas Resolvidos

### 1. **Permissões de Bluetooth Adicionadas**
- ✅ AndroidManifest.xml atualizado com todas as permissões necessárias
- ✅ Suporte para Android 12+ (BLUETOOTH_CONNECT, BLUETOOTH_SCAN)
- ✅ Suporte para Android 11 e abaixo (BLUETOOTH, BLUETOOTH_ADMIN)
- ✅ Permissões de localização necessárias para BLE scanning

## 🚀 Como Buildar e Rodar no Celular

### Passo 1: Preparar o App
```bash
# Instalar dependências
npm install

# Buildar e sincronizar com mobile
npm run mobile:build
```

### Passo 2: Rodar no Android
```bash
# Opção 1: Abrir no Android Studio
npm run mobile:android

# Opção 2: Rodar direto no celular (com USB debug ativado)
npm run mobile:android:run
```

### Passo 3: Configurar o Celular
1. **Ativar Modo Desenvolvedor**: Config → Sobre → Número da Versão (toque 7x)
2. **Ativar USB Debugging**: Config → Opções do Desenvolvedor → USB Debugging
3. **Aceitar permissões quando solicitado**

## 🔧 Problemas Comuns e Soluções

### ❌ "App não instala"
**Solução**: Desinstale versões antigas antes de instalar
```bash
cd android
./gradlew clean
cd ..
npm run mobile:build
```

### ❌ "Bluetooth não funciona"
**Solução**: Verifique as permissões
1. Vá em Config → Aplicativos → ESP32 CAR → Permissões
2. Ative: Localização, Bluetooth, Armazenamento

### ❌ "Tela branca ao abrir"
**Solução**: Verifique o console
```bash
# Conecte o celular e veja os logs
npx cap run android --livereload
```

### ❌ "Não encontra dispositivos BLE"
**Solução**: 
1. Certifique-se que o ESP32 está ligado e transmitindo
2. Verifique se o GPS do celular está ativado (necessário para BLE)
3. Reinicie o Bluetooth do celular

## 📋 Checklist Final

Antes de testar no celular:
- [ ] Permissões no AndroidManifest.xml atualizadas
- [ ] npm run mobile:build executado com sucesso
- [ ] USB Debugging ativado no celular
- [ ] GPS ativado no celular
- [ ] Bluetooth ativado no celular
- [ ] ESP32 está ligado e transmitindo

## 🆘 Ainda com problemas?

Me diga exatamente:
1. Qual erro aparece? (mensagem completa)
2. Em que etapa do processo? (instalação, abertura, bluetooth, etc)
3. Qual modelo do celular e versão do Android?
4. O app foi buildado com sucesso (sem erros no terminal)?