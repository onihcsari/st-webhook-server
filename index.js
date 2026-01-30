const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors'); // ★ 추가됨

const app = express();

// ★ [핵심] 모든 도메인에서의 요청 허용 (CORS 해결)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST']
}));

const server = http.createServer(app);

// ★ [핵심] 소켓도 모든 곳에서 접속 허용
const io = new Server(server, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    } 
});

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const d = req.body;
  if (!d) return res.status(200).send({});

  console.log(`[신호 수신] ${d.lifecycle}`);

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

  // 3. INSTALL / UPDATE (구독 갱신)
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치/업데이트 완료! 구독 갱신 시작...');
    const installData = d.installData || d.updateData;
    refreshSubscriptions(
        installData.installedApp.config.sensors, 
        installData.installedApp.installedAppId, 
        installData.authToken
    );
    return res.status(200).send({ installData: {} });
  }

  // 4. EVENT (데이터 전송)
  if (d.lifecycle === 'EVENT') {
    if (!d.eventData || !d.eventData.deviceEvents) return res.status(200).send({});

    const events = d.eventData.deviceEvents;
    
    events.forEach(event => {
      // 로그 출력 (디버깅용)
      if(event.capability !== 'battery') { // 배터리 정보는 로그 생략
          console.log(`[이벤트] ${event.deviceId} / ${event.value}`);
      }

      // Sihas 로직
      if (event.capability.includes('inOutDirectionV2') || event.attribute === 'inOutDir') {
        const val = event.value; 
        const deviceId = event.deviceId;
        let isOccupied = (val === 'in' || val === 'out');

        console.log(`📢 앱으로 전송: ${val}`);

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

// 구독 함수
async function refreshSubscriptions(sensors, installedAppId, token) {
  if (!sensors) return;
  // 기존 삭제 생략하고 덮어쓰기 시도 (단순화)
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
            capability: 'afterguide46998.inOutDirectionV2',
            attribute: 'inOutDir',
            stateChangeOnly: true,
            subscriptionName: `sub_${deviceId.substring(0,8)}`
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ 구독 확인: ${deviceId}`);
    } catch (e) {
       // 이미 존재하면(409) 성공으로 간주
       if(e.response?.status !== 409) console.error(`구독 에러: ${e.message}`);
    }
  }
}

app.get('/keep-alive', (req, res) => res.send('CORS Fixed!'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
