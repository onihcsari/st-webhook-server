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

  // 3. INSTALL / UPDATE (★수정됨: 청소 후 구독)
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치/업데이트 신호 수신!');

    const installData = d.installData || d.updateData;
    const authToken = installData.authToken;
    const installedAppId = installData.installedApp.installedAppId;
    const sensors = installData.installedApp.config.sensors;

    // [중요] 기존 구독을 모두 지우고 다시 등록합니다 (비동기 처리)
    refreshSubscriptions(sensors, installedAppId, authToken);

    return res.status(200).send({ installData: {} });
  }

  // 4. EVENT
  if (d.lifecycle === 'EVENT') {
    if (!d.eventData || !d.eventData.deviceEvents) {
        return res.status(200).send({});
    }

    const events = d.eventData.deviceEvents;
    
    events.forEach(event => {
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

// [핵심 함수] 지우고 -> 다시 구독
async function refreshSubscriptions(sensors, installedAppId, token) {
  if (!sensors || !Array.isArray(sensors)) return;

  console.log('🧹 기존 구독 삭제 시작...');
  
  try {
    // 1. 기존 구독 목록 가져오기
    const response = await axios.get(
      `https://api.smartthings.com/v1/installedapps/${installedAppId}/subscriptions`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const oldSubscriptions = response.data.items || [];
    
    // 2. 하나씩 삭제하기 (Bulk delete는 가끔 에러나서 안전하게 하나씩 지움)
    for (const sub of oldSubscriptions) {
        await axios.delete(
            `https://api.smartthings.com/v1/installedapps/${installedAppId}/subscriptions/${sub.subscriptionId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
    }
    console.log('✨ 청소 완료! 새 구독 시작...');

  } catch (e) {
    console.log('청소 중 에러(무시 가능):', e.message);
  }

  // 3. 새 구독 등록
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
            subscriptionName: `sub_${deviceId.substring(0,8)}`
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ 재구독 성공! (${deviceId})`);
    } catch (e) {
      // 만약 그래도 충돌나면(409), 이미 되어있는 거니까 성공으로 간주
      if (e.response && e.response.status === 409) {
          console.log(`⚠️ 이미 구독됨 (성공으로 간주): ${deviceId}`);
      } else {
          console.error(`❌ 구독 실패 (${deviceId}):`, e.response?.data || e.message);
      }
    }
  }
}

app.get('/keep-alive', (req, res) => res.send('Clean & Subscribe Logic!'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
