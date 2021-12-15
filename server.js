const { ClientCredentialsAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { EventSubListener, ReverseProxyAdapter } = require('@twurple/eventsub');

const WebSocket = require('ws');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const SHARED_SECRET = process.env.TWITCH_SHARED_SECRET;

const authProvider = new ClientCredentialsAuthProvider(CLIENT_ID, CLIENT_SECRET);
const apiClient = new ApiClient({ authProvider });

const listener = new EventSubListener({
	apiClient,
	adapter: new ReverseProxyAdapter({
		hostName: 'deusprogrammer.com',
        pathPrefix: '/api/twitch-hooks',
        port: 8080
	}),
	secret: SHARED_SECRET
});

listener.listen();

// Fire up a websocket to act as a communication hub for all bots
const wss = new WebSocket.Server({ port: 8081 });
const clients = {};

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

                clients[channelId] = {
                    listeners
                };
                break;
            case "DISCONNECT":
                if (!(channelId in clients)) {
                    return;
                }

                // Kill listeners
                for (const l of clients[channelId].listeners) {
                    listener.removeListener(l);
                }
                clients[channelId] = null;
                ws.close();
                break;
            default:
                return;
        }
    });
});