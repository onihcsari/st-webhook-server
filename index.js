const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

app.use(bodyParser.json());

// ★★★ [설정] 8개 방 매칭 (센서ID : 조명ID) ★★★
// 센서 ID는 Render 로그 보시고 채워 넣으셔야 합니다!
const ROOM_MAP = {
    // 1번방 (아까 확인된 센서 : Zigbee Light 1)
    '1dc526f0-c8ab-49e8-b173-777c637c75f5': 'e810bfe9-c6f6-4479-9345-0e5d56612d6b',

    // 2번방 (센서ID : Zigbee Light 2)
    '여기에_2번방_센서ID_입력': 'a6b69078-213e-4064-bffc-e0cf125ac7e4',

    // 3번방 (센서ID : Zigbee Light 3)
    '여기에_3번방_센서ID_입력': '142bd1dd-89b2-41a8-953b-5f565c239d16',

    // 4번방 (센서ID : Zigbee Light 4)
    '여기에_4번방_센서ID_입력': '9146fc15-56b6-4362-bac3-8d676f2ec16a',

    // 5번방 (센서ID : Zigbee Light 5)
    '여기에_5번방_센서ID_입력': '00335cf1-7b07-4d09-8490-a7c7c1538988',

    // 6번방 (센서ID : Zigbee Light 6)
    '여기에_6번방_센서ID_입력': '19d8eb82-41e7-4fe0-a1d0-f76f5dce3fac',

    // 7번방 (센서ID : Zigbee Light 7)
    '여기에_7번방_센서ID_입력': '3065b27f-0f2d-4271-82cd-1539d6db6fdd',

    // 8번방 (센서ID : Zigbee Light 8)
    '여기에_8번방_센서ID_입력': '0870ec1e-ed17-4895-bf3e-929f8014a4e9',
};

app.post('/webhook', async (req, res) => {
  const d = req.body;
  if (!d) return res.status(200).send({});

  // 1. PING & CONFIRMATION
  if (d.lifecycle === 'PING') return res.send({ pingData: { challenge: d.pingData.challenge } });
  if (d.lifecycle === 'CONFIRMATION') return res.send({ targetUrl: d.confirmationData.confirmationUrl });

  // 2. CONFIGURATION
  if (d.lifecycle === 'CONFIGURATION') {
    const phase = d.configurationData.phase;
    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Sihas 8 Room Controller",
            description: "8개 공간 제어 시스템",
            id: "app",
            permissions: ["r:devices:*", "x:devices:*"],
            firstPageId: "1"
          }
        }
      });
    }
    if (phase === 'PAGE') {
      return res.send({
        configurationData: {
          page: {
            pageId: "1",
            name: "기기 선택",
            complete: true,
            sections: [{
              name: "전체 기기 등록",
              settings: [
                {
                    id: "sensors",
                    name: "센서 8개 모두 선택",
                    description: "사용할 모션 센서를 모두 체크하세요",
                    type: "DEVICE",
                    required: true,
                    multiple: true,
                    capabilities: ["motionSensor"], 
                    permissions: ["r", "x"]
                },
                {
                    id: "lights", 
                    name: "조명 8개 모두 선택",
                    description: "사용할 조명을 모두 체크하세요",
                    type: "DEVICE",
                    required: true,
                    multiple: true,
                    capabilities: ["switch"], 
                    permissions: ["r", "x"]
                }
              ]
            }]
          }
        }
      });
    }
  }

  // 3. INSTALL / UPDATE
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설정 변경! 구독을 갱신합니다.');
    const data = d.installData || d.updateData;
    const installedAppId = data.installedApp.installedAppId;
    const authToken = data.authToken;
    const sensors = data.installedApp.config.sensors;
    
    subscribeToSensors(sensors, installedAppId, authToken);
    return res.status(200).send({ installData: {} });
  }

  // 4. EVENT
  if (d.lifecycle === 'EVENT') {
    const eventData = d.eventData;
    const authToken = eventData.authToken; 

    if (eventData && eventData.events) {
        eventData.events.forEach(item => {
            if (item.eventType === 'DEVICE_EVENT' && item.deviceEvent) {
                const event = item.deviceEvent;
                
                // 모션 센서 이벤트 체크
                if (event.capability === 'motionSensor' && event.attribute === 'motion') {
                    const sensorId = event.deviceId;
                    const val = event.value; // 'active' or 'inactive'
                    const isOccupied = (val === 'active'); 

                    console.log(`⚡ [감지] ${sensorId} -> ${val}`);

                    // 1) 앱으로 전송
                    io.emit('sensor-update', {
                        deviceId: sensorId,
                        status: val,
                        isOccupied: isOccupied,
                        timestamp: new Date().toISOString()
                    });

                    // 2) 조명 제어
                    const targetLightId = ROOM_MAP[sensorId];

                    if (targetLightId) {
                        const command = isOccupied ? 'on' : 'off';
                        console.log(`💡 [제어] 조명(${targetLightId}) -> ${command}`);
                        controlLight(targetLightId, command, authToken);
                    } else {
                        // 만약 여기에 로그가 찍히면, 그 센서 ID를 복사해서 위 ROOM_MAP에 채워넣으세요!
                        console.log(`⚠️ [알림] 등록되지 않은 센서 ID입니다: ${sensorId}`);
                    }
                }
            }
        });
    }
    return res.status(200).send({});
  }

  res.status(200).send({});
});

// 구독 함수
async function subscribeToSensors(sensors, installedAppId, token) {
    if (!sensors) return;
    for (const sensor of sensors) {
        const deviceId = sensor.deviceConfig.deviceId;
        try {
            await axios.post(
                `https://api.smartthings.com/v1/installedapps/${installedAppId}/subscriptions`,
                {
                    sourceType: 'DEVICE',
                    device: {
                        deviceId: deviceId,
                        componentId: 'main',
                        capability: 'motionSensor',
                        attribute: 'motion',
                        stateChangeOnly: true,
                        subscriptionName: `sub_${deviceId.substring(0, 8)}`
                    }
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (e) { console.log('구독 에러(무시 가능)'); }
    }
    console.log(`✅ ${sensors.length}개 센서 구독 완료`);
}

// 제어 함수
async function controlLight(deviceId, command, token) {
    try {
        await axios.post(
            `https://api.smartthings.com/v1/devices/${deviceId}/commands`,
            {
                commands: [{
                    component: 'main',
                    capability: 'switch',
                    command: command,
                    arguments: []
                }]
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );
    } catch (e) {
        console.error(`❌ 제어 실패: ${e.message}`);
    }
}

app.get('/keep-alive', (req, res) => res.send('Server Running'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
