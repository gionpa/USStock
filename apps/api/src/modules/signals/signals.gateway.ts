import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SignalsService } from './signals.service';
import { TradingSignal } from '@/common/interfaces';

@WebSocketGateway({
  namespace: '/signals',
  cors: {
    origin: '*',
  },
})
export class SignalsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SignalsGateway.name);
  private readonly clientSubscriptions = new Map<string, Set<string>>();

  constructor(private readonly signalsService: SignalsService) {}

  afterInit() {
    this.logger.log('Signals WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to signals: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from signals: ${client.id}`);
    this.clientSubscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribeToSignals')
  handleSubscribeToSignals(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    const { symbols } = data;
    const clientSubs = this.clientSubscriptions.get(client.id)!;

    symbols.forEach((symbol) => clientSubs.add(symbol.toUpperCase()));

    this.logger.log(`Client ${client.id} subscribed to signals: ${symbols.join(', ')}`);
    return { success: true, subscribed: symbols };
  }

  @SubscribeMessage('unsubscribeFromSignals')
  handleUnsubscribeFromSignals(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols: string[] },
  ) {
    const { symbols } = data;
    const clientSubs = this.clientSubscriptions.get(client.id)!;

    symbols.forEach((symbol) => clientSubs.delete(symbol.toUpperCase()));

    this.logger.log(`Client ${client.id} unsubscribed from signals: ${symbols.join(', ')}`);
    return { success: true, unsubscribed: symbols };
  }

  @SubscribeMessage('getSignal')
  async handleGetSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    const signal = await this.signalsService.getSignalForSymbol(
      data.symbol.toUpperCase(),
    );
    return { success: true, signal };
  }

  @SubscribeMessage('getWatchlistSignals')
  async handleGetWatchlistSignals(@ConnectedSocket() client: Socket) {
    const signals = await this.signalsService.getSignalsForWatchlist();
    const result: Record<string, TradingSignal | null> = {};

    signals.forEach((signal, symbol) => {
      result[symbol] = signal;
    });

    return { success: true, signals: result };
  }

  // Broadcast new signal to all subscribed clients
  broadcastSignal(signal: TradingSignal) {
    this.clientSubscriptions.forEach((symbols, clientId) => {
      if (symbols.has(signal.symbol) || symbols.has('*')) {
        this.server.to(clientId).emit('newSignal', signal);
      }
    });
  }

  // Broadcast signal update
  broadcastSignalUpdate(signal: TradingSignal) {
    this.clientSubscriptions.forEach((symbols, clientId) => {
      if (symbols.has(signal.symbol) || symbols.has('*')) {
        this.server.to(clientId).emit('signalUpdate', signal);
      }
    });
  }
}
