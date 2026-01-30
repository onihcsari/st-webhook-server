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
  console.log(`[신호 수신] ${d.lifecycle}`);

  // 1. PING & CONFIRMATION (기본)
  if (d.lifecycle === 'PING') {
    return res.send({ pingData: { challenge: d.pingData.challenge } });
  }
  if (d.lifecycle === 'CONFIRMATION') {
    return res.send({ targetUrl: d.confirmationData.confirmationUrl });
  }

  // 2. 화면 설정 (CONFIGURATION)
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
                // 기기 검색용 필터 (refresh는 웬만하면 다 있어서 검색용으로 둠)
                capabilities: ["refresh"], 
                permissions: ["r", "x"]
              }]
            }]
          }
        }
      });
    }
  }

  // 3. 설치 및 업데이트 (구독 신청 - 여기가 핵심!)
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치/업데이트 완료! Sihas 센서 구독 시작...');

    const installData = d.installData || d.updateData;
    const installedApp = installData.installedApp;
    const authToken = d.authToken;
    const installedAppId = installedApp.installedAppId;
    const sensors = installedApp.config.sensors;

    // 비동기로 구독 신청 함수 호출
    subscribeToSihas(sensors, installedAppId, authToken);

    return res.status(200).send({ installData: {} });
  }

  // 4. 이벤트 수신 (실제 감지 로직)
  if (d.lifecycle === 'EVENT') {
    const events = d.eventData.deviceEvents;
    
    events.forEach(event => {
      // 우리가 원하는 그 '방향' 데이터인지 확인
      // capability ID가 길어서 포함 여부로 체크
      if (event.capability.includes('inOutDirectionV2') || event.attribute === 'inOutDir') {
        
        const val = event.value; // ready, in, out
        const deviceId = event.deviceId;
        
        // 사용자님 로직 적용
        let isOccupied = false;
        let statusText = "사람 없음 (빈 방)";

        if (val === 'in' || val === 'out') {
            isOccupied = true;
            statusText = `🚨 사람 감지됨! (${val})`;
        } else if (val === 'ready') {
            isOccupied = false;
            statusText = "🟢 사람 없음 (Ready)";
        }

        console.log(`[센서 감지] 디바이스: ${deviceId}`);
        console.log(`   👉 원본값: ${val}`);
        console.log(`   👉 판  단: ${statusText}`);

        // 나중에 Ionic 앱으로 보낼 데이터
        io.emit('sensor-update', {
            deviceId: deviceId,
            status: val,
            isOccupied: isOccupied,
            timestamp: new Date().toISOString()
        });
      } else {
        // 배터리나 다른 정보면 그냥 로그만 살짝
        console.log(`[기타 정보] ${event.capability} -> ${event.value}`);
      }
    });
    return res.status(200).send({});
  }

  res.status(200).send({});
});

// [구독 함수] Sihas 센서의 inOutDir만 콕 집어서 구독
async function subscribeToSihas(sensors, installedAppId, token) {
  for (const sensor of sensors) {
    const deviceId = sensor.deviceConfig.deviceId;
    
    // ★ 여기가 중요합니다! 정확한 Capability ID를 입력해야 합니다.
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
            capability: customCapability, // 정확한 ID 명시
            attribute: customAttribute,   // 정확한 속성 명시
            stateChangeOnly: true,
            subscriptionName: `sub_${deviceId.substring(0,6)}`
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ 구독 성공! (${deviceId}) - ${customAttribute}`);
    } catch (e) {
      console.error(`❌ 구독 실패 (${deviceId}):`, e.response?.data || e.message);
    }
  }
}

app.get('/keep-alive', (req, res) => res.send('Sihas Logic Active!'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
