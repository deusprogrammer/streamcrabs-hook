const { ClientCredentialsAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { EventSubListener, ReverseProxyAdapter } = require('@twurple/eventsub');

const WebSocket = require('ws');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const SHARED_SECRET = process.env.TWITCH_SHARED_SECRET;

const authProvider = new ClientCredentialsAuthProvider(CLIENT_ID, CLIENT_SECRET);
const apiClient = new ApiClient({ authProvider });

// Setup listener
const listener = new EventSubListener({
	apiClient,
	adapter: new ReverseProxyAdapter({
		hostName: 'deusprogrammer.com',
        pathPrefix: '/api/twitch-hooks',
        port: 8080
	}),
	secret: SHARED_SECRET,
    logger: {
        minLevel: "DEBUG"
    }
});

listener.listen();

console.log("* Started hook server on 8080");

// Fire up a websocket to act as a communication hub for all bots
const wss = new WebSocket.Server({ port: 8081 });
const clients = {};

const removeListener = ({listeners, ws, interval}) => {
    // Kill listeners
    for (const l of listeners) {
        listener.removeListener(l);
    }
    clearInterval(interval);
    ws.close();
}

wss.on('connection', async (ws) => {
    console.log("CONNECTION");
    ws.on('message', async (message) => {
        const {type, channelId, listenTo} = JSON.parse(message);

        console.log("MESSAGE: " + message);

        switch(type) {
            case "CONNECT":
                const listeners = [];
                if (listenTo.includes("FOLLOW")) {
                    listeners.push(listener.subscribeToChannelFollowEvents(channelId, ({userId, userName, broadcasterId, broadcasterName}) => {
                        ws.send(JSON.stringify({
                            type: "FOLLOW",
                            userId,
                            userName,
                            broadcasterId,
                            broadcasterName
                        }));
                    }));
                } 
                
                if (listenTo.includes("ONLINE")) {
                    listeners.push(listener.subscribeToStreamOnlineEvents(channelId, ({broadcasterId, broadcasterName}) => {
                        ws.send(JSON.stringify({
                            type: "ONLINE",
                            broadcasterId,
                            broadcasterName
                        }));
                    }));
                }

                if (listenTo.includes("OFFLINE")) {
                    listeners.push(listener.subscribeToStreamOfflineEvents(channelId, ({broadcasterId, broadcasterName}) => {
                        ws.send(JSON.stringify({
                            type: "OFFLINE",
                            broadcasterId,
                            broadcasterName
                        }));
                    }));
                }

                if (listenTo.includes("SUB")) {
                    // listeners.push(listener.subscribeToChannelSubscriptionEvents(channelId, ({broadcasterId, broadcasterName, userId, userName, tier}) => {
                    //     ws.send(JSON.stringify({
                    //         type: "SUB",
                    //         broadcasterId,
                    //         broadcasterName,
                    //         userId,
                    //         userName,
                    //         subPlan: tier
                    //     }));
                    // }));
                    listeners.push(listener.subscribeToChannelSubscriptionMessageEvents(channelId, ({broadcasterId, broadcasterName, userId, userName, tier}) => {
                        ws.send(JSON.stringify({
                            type: "SUB",
                            broadcasterId,
                            broadcasterName,
                            userId,
                            userName,
                            subPlan: tier
                        }));
                    }));
                }

                if (listenTo.includes("CHEER")) {
                    listeners.push(listener.subscribeToChannelCheerEvents(channelId, ({broadcasterId, broadcasterName, userId, userName, bits}) => {
                        ws.send(JSON.stringify({
                            type: "CHEER",
                            broadcasterId,
                            broadcasterName,
                            userId,
                            userName,
                            bits
                        }));
                    }));
                }

                if (listenTo.includes("REDEMPTION")) {
                    listeners.push(listener.subscribeToChannelRedemptionAddEvents(channelId, ({id, broadcasterId, broadcasterName, userId, userName, rewardId, rewardTitle, rewardCost}) => {
                        ws.send(JSON.stringify({
                            type: "REDEMPTION",
                            broadcasterId,
                            broadcasterName,
                            userId,
                            userName,
                            id,
                            rewardId,
                            rewardTitle,
                            rewardCost
                        }));
                    }));
                }

                const client = {
                    ws,
                    channelId,
                    listeners,
                    lastPing: Date.now()
                };

                client.interval = setInterval(() => {
                    // If connection is stale, remove connection
                    if (Date.now() - client.lastPing > 60000) {
                        console.log(`Removing listeners for ${channelId}`);
                        removeListener(client);
                    }
                    ws.send(JSON.stringify({
                        type: "PING"
                    }));
                }, 30000);

                clients[channelId] = client;

                break;
            case "DISCONNECT":
                if (!(channelId in clients)) {
                    return;
                }

                removeListener(clients[channelId]);

                clients[channelId] = null;
                ws.close();
                break;
            case "PONG":
                if (!(channelId in clients)) {
                    return;
                }

                clients[channelId].lastPing = Date.now();
                break;
            default:
                return;
        }
    });
});