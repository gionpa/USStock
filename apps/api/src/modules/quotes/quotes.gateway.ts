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
import { QuotesService, QuoteUpdate, OrderBookUpdate } from './quotes.service';

interface SubscriptionMessage {
  symbols: string[];
}

@WebSocketGateway({
  namespace: '/quotes',
  cors: {
    origin: '*',
  },
})
export class QuotesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(QuotesGateway.name);
  private readonly clientSubscriptions = new Map<string, Set<string>>();
  private readonly unsubscribeFunctions = new Map<string, Map<string, () => void>>();

  constructor(private readonly quotesService: QuotesService) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
    this.unsubscribeFunctions.set(client.id, new Map());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Unsubscribe from all symbols
    const unsubscribers = this.unsubscribeFunctions.get(client.id);
    if (unsubscribers) {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    }

    this.clientSubscriptions.delete(client.id);
    this.unsubscribeFunctions.delete(client.id);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscriptionMessage,
  ) {
    const { symbols } = data;
    const clientSubs = this.clientSubscriptions.get(client.id)!;
    const unsubscribers = this.unsubscribeFunctions.get(client.id)!;

    for (const symbol of symbols) {
      if (clientSubs.has(symbol)) continue;

      clientSubs.add(symbol);

      // Subscribe to quote updates
      const unsubscribe = this.quotesService.subscribe(
        symbol,
        (update: QuoteUpdate) => {
          client.emit('quote', update);
        },
      );

      // Subscribe to order book updates
      const unsubscribeOrderBook = this.quotesService.subscribeOrderBook(
        symbol,
        (update: OrderBookUpdate) => {
          client.emit('orderbook', update);
        },
      );

      unsubscribers.set(symbol, () => {
        unsubscribe();
        unsubscribeOrderBook();
      });
    }

    this.logger.log(`Client ${client.id} subscribed to: ${symbols.join(', ')}`);
    return { success: true, subscribed: symbols };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscriptionMessage,
  ) {
    const { symbols } = data;
    const clientSubs = this.clientSubscriptions.get(client.id)!;
    const unsubscribers = this.unsubscribeFunctions.get(client.id)!;

    for (const symbol of symbols) {
      if (!clientSubs.has(symbol)) continue;

      clientSubs.delete(symbol);

      const unsubscribe = unsubscribers.get(symbol);
      if (unsubscribe) {
        unsubscribe();
        unsubscribers.delete(symbol);
      }
    }

    this.logger.log(`Client ${client.id} unsubscribed from: ${symbols.join(', ')}`);
    return { success: true, unsubscribed: symbols };
  }

  @SubscribeMessage('getQuote')
  async handleGetQuote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    const quote = await this.quotesService.getQuote(data.symbol);
    return { success: true, quote };
  }

  // Broadcast to all clients subscribed to a symbol
  broadcastToSymbol(symbol: string, event: string, data: any) {
    this.clientSubscriptions.forEach((symbols, clientId) => {
      if (symbols.has(symbol)) {
        this.server.to(clientId).emit(event, data);
      }
    });
  }
}
