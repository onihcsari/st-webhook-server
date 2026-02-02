const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // ★ 구독 신청용
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// CORS 허용
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const d = req.body;
  if (!d) return res.status(200).send({});

  // 1. PING & CONFIRMATION
  if (d.lifecycle === 'PING') {
    return res.send({ pingData: { challenge: d.pingData.challenge } });
  }
  if (d.lifecycle === 'CONFIRMATION') {
    return res.send({ targetUrl: d.confirmationData.confirmationUrl });
  }

  // 2. CONFIGURATION
  if (d.lifecycle === 'CONFIGURATION') {
    const phase = d.configurationData.phase;
    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Sihas Monitor",
            description: "사람 유무 감지",
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
              name: "센서 목록",
              settings: [{
                id: "sensors",
                name: "센서 선택",
                description: "4개 다 체크하세요",
                type: "DEVICE",
                required: true,
                multiple: true,
                capabilities: ["refresh"], 
                permissions: ["r", "x"]
              }]
            }]
          }
        }
      });
    }
  }

  // ★★★ 3. INSTALL / UPDATE (구독 신청 로직 부활!) ★★★
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설정 변경 감지! 구독 갱신을 시작합니다...');
    
    // 데이터 위치 파악
    const data = d.installData || d.updateData;
    const installedAppId = data.installedApp.installedAppId;
    const authToken = data.authToken;
    const sensors = data.installedApp.config.sensors;

    // 비동기로 구독 요청 실행 (응답 먼저 보내고 뒤에서 처리)
    subscribeToSensors(sensors, installedAppId, authToken);

    return res.status(200).send({ installData: {} });
  }

  // 4. EVENT (데이터 수신 - 아까 고친 완벽한 버전)
  if (d.lifecycle === 'EVENT') {
    const eventData = d.eventData;

    if (eventData && eventData.events) {
        eventData.events.forEach(item => {
            if (item.eventType === 'DEVICE_EVENT' && item.deviceEvent) {
                const event = item.deviceEvent;
                console.log(`⚡ [감지됨] ID: ${event.deviceId} / 값: ${event.value}`);

                // Sihas 센서 로직
                if (event.capability.includes('inOutDirectionV2') || event.attribute === 'inOutDir') {
                    const val = event.value; 
                    const isOccupied = (val === 'in' || val === 'out');
                    console.log(`📢 앱으로 전송: ${val}`);

                    io.emit('sensor-update', {
                        deviceId: event.deviceId,
                        status: val,
                        isOccupied: isOccupied,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });
    }
    return res.status(200).send({});
  }

  res.status(200).send({});
});

// ★ [핵심 함수] 삼성 서버에 구독 요청을 보내는 함수
async function subscribeToSensors(sensors, installedAppId, token) {
    if (!sensors || sensors.length === 0) return;

    console.log(`총 ${sensors.length}개의 센서에 대해 구독을 시도합니다.`);

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
                        capability: 'afterguide46998.inOutDirectionV2', // 센서 기능 ID
                        attribute: 'inOutDir',
                        stateChangeOnly: true,
                        subscriptionName: `sub_${deviceId.substring(0, 8)}`
                    }
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            console.log(`✅ 구독 성공: ${deviceId}`);
        } catch (error) {
            // 409 에러는 '이미 구독됨'이므로 성공으로 간주
            if (error.response && error.response.status === 409) {
                console.log(`ℹ️ 이미 구독중임: ${deviceId}`);
            } else {
                console.error(`❌ 구독 실패 (${deviceId}):`, error.message);
            }
        }
    }
}

app.get('/keep-alive', (req, res) => res.send('Full System Active'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
