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

// ★★★ [중요] ID 매칭 (센서ID : 조명ID) ★★★
const ROOM_MAP = {
    // 1번방 (새로 산 모션 센서 : 지그비 조명)
    '1dc526f0-c8ab-49e8-b173-777c637c75f5': 'e810bfe9-c6f6-4479-9345-0e5d56612d6b',
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
            name: "Sihas Motion Monitor",
            description: "모션 감지 및 조명 제어",
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
              name: "센서 & 조명 설정",
              settings: [
                {
                    id: "sensors",
                    name: "모션 센서 선택",
                    description: "새로 산 모션 센서를 선택하세요",
                    type: "DEVICE",
                    required: true,
                    multiple: true,
                    capabilities: ["motionSensor"], // ★ 모션 센서만 보이게 필터링
                    permissions: ["r", "x"]
                },
                {
                    id: "lights", 
                    name: "조명 선택",
                    description: "제어할 조명을 선택하세요",
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

  // 3. INSTALL / UPDATE (구독 신청)
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설정 변경! 구독을 갱신합니다.');
    const data = d.installData || d.updateData;
    const installedAppId = data.installedApp.installedAppId;
    const authToken = data.authToken;
    const sensors = data.installedApp.config.sensors;
    
    subscribeToSensors(sensors, installedAppId, authToken);
    return res.status(200).send({ installData: {} });
  }

  // ★★★ 4. EVENT (핵심 로직: 모션 감지 -> 앱 전송 -> 조명 제어) ★★★
  if (d.lifecycle === 'EVENT') {
    const eventData = d.eventData;
    const authToken = eventData.authToken; 

    if (eventData && eventData.events) {
        eventData.events.forEach(item => {
            if (item.eventType === 'DEVICE_EVENT' && item.deviceEvent) {
                const event = item.deviceEvent;
                
                // ★ 여기가 바뀌었습니다! (motionSensor 체크)
                if (event.capability === 'motionSensor' && event.attribute === 'motion') {
                    const sensorId = event.deviceId;
                    const val = event.value; // 'active' 또는 'inactive'
                    
                    // active면 사람 있음(true), inactive면 없음(false)
                    const isOccupied = (val === 'active'); 

                    console.log(`⚡ [모션감지] ${sensorId} -> ${val} (사람있음: ${isOccupied})`);

                    // 1) 앱으로 상태 전송
                    io.emit('sensor-update', {
                        deviceId: sensorId,
                        status: val,
                        isOccupied: isOccupied,
                        timestamp: new Date().toISOString()
                    });

                    // 2) 조명 제어 (자동화)
                    const targetLightId = ROOM_MAP[sensorId];

                    if (targetLightId) {
                        const command = isOccupied ? 'on' : 'off'; // 사람 있으면 ON, 없으면 OFF
                        console.log(`💡 [제어] 조명(${targetLightId})을 ${command} 시킵니다.`);
                        controlLight(targetLightId, command, authToken);
                    } else {
                        console.log(`⚠️ [알림] 매칭된 조명이 없습니다.`);
                    }
                }
            }
        });
    }
    return res.status(200).send({});
  }

  res.status(200).send({});
});

// [함수 1] 센서 구독 (모션 센서용으로 변경됨)
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
                        capability: 'motionSensor', // ★ 모션 센서 구독
                        attribute: 'motion',        // ★ 모션 값 구독
                        stateChangeOnly: true,
                        subscriptionName: `sub_${deviceId.substring(0, 8)}`
                    }
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (e) { /* 에러 무시 */ }
    }
    console.log(`✅ ${sensors.length}개 센서 구독 완료`);
}

// [함수 2] 조명 제어 (그대로)
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
        console.log(`   👉 명령 전송 성공: ${command}`);
    } catch (e) {
        console.error(`   ❌ 조명 제어 실패: ${e.message}`);
    }
}

app.get('/keep-alive', (req, res) => res.send('Motion Server Running'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
