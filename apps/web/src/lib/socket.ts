import { io, Socket } from 'socket.io-client';

const rawSocketUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
const normalizedSocketUrl = rawSocketUrl.startsWith('http://') || rawSocketUrl.startsWith('https://')
  ? rawSocketUrl
  : `https://${rawSocketUrl}`;
const SOCKET_URL = normalizedSocketUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');

class SocketManager {
  private quotesSocket: Socket | null = null;
  private signalsSocket: Socket | null = null;

  connectQuotes(): Socket {
    if (!this.quotesSocket) {
      this.quotesSocket = io(`${SOCKET_URL}/quotes`, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.quotesSocket.on('connect', () => {
        console.log('Connected to quotes WebSocket');
      });

      this.quotesSocket.on('disconnect', () => {
        console.log('Disconnected from quotes WebSocket');
      });

      this.quotesSocket.on('error', (error) => {
        console.error('Quotes WebSocket error:', error);
      });
    }

    return this.quotesSocket;
  }

  connectSignals(): Socket {
    if (!this.signalsSocket) {
      this.signalsSocket = io(`${SOCKET_URL}/signals`, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.signalsSocket.on('connect', () => {
        console.log('Connected to signals WebSocket');
      });

      this.signalsSocket.on('disconnect', () => {
        console.log('Disconnected from signals WebSocket');
      });

      this.signalsSocket.on('error', (error) => {
        console.error('Signals WebSocket error:', error);
      });
    }

    return this.signalsSocket;
  }

  disconnectAll() {
    if (this.quotesSocket) {
      this.quotesSocket.disconnect();
      this.quotesSocket = null;
    }

    if (this.signalsSocket) {
      this.signalsSocket.disconnect();
      this.signalsSocket = null;
    }
  }

  subscribeToQuotes(symbols: string[]) {
    const socket = this.connectQuotes();
    socket.emit('subscribe', { symbols });
  }

  unsubscribeFromQuotes(symbols: string[]) {
    if (this.quotesSocket) {
      this.quotesSocket.emit('unsubscribe', { symbols });
    }
  }

  subscribeToSignals(symbols: string[]) {
    const socket = this.connectSignals();
    socket.emit('subscribeToSignals', { symbols });
  }

  unsubscribeFromSignals(symbols: string[]) {
    if (this.signalsSocket) {
      this.signalsSocket.emit('unsubscribeFromSignals', { symbols });
    }
  }

  onQuoteUpdate(callback: (data: any) => void) {
    const socket = this.connectQuotes();
    socket.on('quote', callback);
    return () => socket.off('quote', callback);
  }

  onOrderBookUpdate(callback: (data: any) => void) {
    const socket = this.connectQuotes();
    socket.on('orderbook', callback);
    return () => socket.off('orderbook', callback);
  }

  onNewSignal(callback: (data: any) => void) {
    const socket = this.connectSignals();
    socket.on('newSignal', callback);
    return () => socket.off('newSignal', callback);
  }

  onSignalUpdate(callback: (data: any) => void) {
    const socket = this.connectSignals();
    socket.on('signalUpdate', callback);
    return () => socket.off('signalUpdate', callback);
  }
}

export const socketManager = new SocketManager();
export default socketManager;
