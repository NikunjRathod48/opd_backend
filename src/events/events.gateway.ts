import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*', // We can restrict this in production
    },
})

export class EventsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private logger: Logger = new Logger('EventsGateway');

    afterInit(server: Server) {
        this.logger.log('WebSocket Gateway Initialized');
    }

    handleConnection(client: Socket, ...args: any[]) {
        this.logger.log(`Client connected: ${client.id}`);

        // Allow client to join a specific hospital room if needed
        client.on('joinHospital', (hospitalId: number) => {
            client.join(`hospital_${hospitalId}`);
            this.logger.log(`Client ${client.id} joined hospital_${hospitalId}`);
        });
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    /**
     * Broadcasts a queue update event to a specific hospital room.
     */
    broadcastQueueUpdate(hospitalId: number, dailyQueueId?: number) {
        this.server.to(`hospital_${hospitalId}`).emit('queue:updated', {
            hospitalId,
            dailyQueueId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcasts a stock update or low stock alert event.
     */
    broadcastStockAlert(hospitalId: number, medicineId: number, medicineName: string, newStock: number) {
        this.server.to(`hospital_${hospitalId}`).emit('stock:alert', {
            hospitalId,
            medicineId,
            medicineName,
            newStock,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcasts when a new prescription is created.
     */
    broadcastPrescriptionCreated(hospitalId: number, visitId: number) {
        this.server.to(`hospital_${hospitalId}`).emit('rx:created', {
            hospitalId,
            visitId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcasts when an OPD visit is created or updated.
     */
    broadcastVisitUpdated(hospitalId: number, visitId: number) {
        this.server.to(`hospital_${hospitalId}`).emit('visit:updated', {
            hospitalId,
            visitId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcasts when patient vitals are recorded or updated.
     */
    broadcastVitalsRecorded(hospitalId: number, visitId: number) {
        this.server.to(`hospital_${hospitalId}`).emit('vitals:recorded', {
            hospitalId,
            visitId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Broadcasts when a bill is created (manual or auto on discharge).
     */
    broadcastBillCreated(hospitalId: number, billId: number, visitId: number) {
        this.server.to(`hospital_${hospitalId}`).emit('bill:created', {
            hospitalId,
            billId,
            visitId,
            timestamp: new Date().toISOString()
        });
    }
}
