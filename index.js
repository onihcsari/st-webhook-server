const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const d = req.body;
  
  // d가 없을 경우를 대비한 방어 코드
  if (!d) return res.status(200).send({});

  console.log(`[신호 수신] ${d.lifecycle}`);

  // 1. PING & CONFIRMATION
  if (d.lifecycle === 'PING') {
    return res.send({ pingData: { challenge: d.pingData.challenge } });
  }
  if (d.lifecycle === 'CONFIRMATION') {
    return res.send({ targetUrl: d.confirmationData.confirmationUrl });
  }

  // 2. CONFIGURATION (화면 설정)
  if (d.lifecycle === 'CONFIGURATION') {
    const phase = d.configurationData.phase;

    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Sihas Monitor",
            description: "사람 유무 실시간 감지",
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
                name: "피플 카운터 선택",
                description: "목록에서 센서를 체크하세요",
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

  // 3. INSTALL / UPDATE (구독 신청)
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치/업데이트 완료! 구독 시작...');

    const installData = d.installData || d.updateData;
    const authToken = installData.authToken; 
    
    const installedApp = installData.installedApp;
    const installedAppId = installedApp.installedAppId;
    const sensors = installedApp.config.sensors;

    subscribeToSihas(sensors, installedAppId, authToken);

    return res.status(200).send({ installData: {} });
  }

  // 4. EVENT (이벤트 수신) - ★ 여기가 에러나던 곳 (수정됨)
  if (d.lifecycle === 'EVENT') {
    // [안전장치] eventData가 없거나 deviceEvents가 비어있으면 그냥 종료
    if (!d.eventData || !d.eventData.deviceEvents) {
        console.log('⚠️ 빈 이벤트 신호 수신 (무시함)');
        return res.status(200).send({});
    }

    const events = d.eventData.deviceEvents;
    
    events.forEach(event => {
      // Sihas 센서 로직
      if (event.capability.includes('inOutDirectionV2') || event.attribute === 'inOutDir') {
        
        const val = event.value; 
        const deviceId = event.deviceId;
        
        let isOccupied = false;
        let statusText = "사람 없음 (빈 방)";

        if (val === 'in' || val === 'out') {
            isOccupied = true;
            statusText = `🚨 사람 감지됨! (${val})`;
        } else if (val === 'ready') {
            isOccupied = false;
            statusText = "🟢 사람 없음 (Ready)";
        }

        console.log(`[센서 감지] ${deviceId} : ${statusText}`);

        io.emit('sensor-update', {
            deviceId: deviceId,
            status: val,
            isOccupied: isOccupied,
            timestamp: new Date().toISOString()
        });
      }
    });
    return res.status(200).send({});
  }

  res.status(200).send({});
});

// [구독 함수]
async function subscribeToSihas(sensors, installedAppId, token) {
  if (!sensors || !Array.isArray(sensors)) return; // 안전장치 추가

  for (const sensor of sensors) {
    const deviceId = sensor.deviceConfig.deviceId;
    const customCapability = 'afterguide46998.inOutDirectionV2';
    const customAttribute = 'inOutDir';

    try {
      await axios.post(
        `https://api.smartthings.com/v1/installedapps/${installedAppId}/subscriptions`,
        {
          sourceType: 'DEVICE',
          device: {
            deviceId: deviceId,
            componentId: 'main',
            capability: customCapability,
            attribute: customAttribute,
            stateChangeOnly: true,
            subscriptionName: `sub_${deviceId.substring(0,6)}`
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ 구독 성공! (${deviceId})`);
    } catch (e) {
      console.error(`❌ 구독 실패 (${deviceId}):`, e.response?.data || e.message);
    }
  }
}

app.get('/keep-alive', (req, res) => res.send('Safety Patch Applied!'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
