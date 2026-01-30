const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
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

  // 1. 무슨 신호인지 먼저 출력
  console.log(`\n========================================`);
  console.log(`[신호 수신] 타입: ${d.lifecycle}`);

  // 2. PING & CONFIRMATION
  if (d.lifecycle === 'PING') {
    return res.send({ pingData: { challenge: d.pingData.challenge } });
  }
  if (d.lifecycle === 'CONFIRMATION') {
    return res.send({ targetUrl: d.confirmationData.confirmationUrl });
  }

  // 3. CONFIGURATION
  if (d.lifecycle === 'CONFIGURATION') {
    // ... (기존 설정 코드 유지 - 길어서 생략하지만 실제 파일엔 있어야 함) ...
    // 설정을 바꾸진 않으셨을 테니 이 부분은 Render에서 기존 그대로 둬도 됩니다.
    // 혹시 모르니 전체 코드를 원하시면 말씀하세요. 일단 EVENT가 급하니 넘어가겠습니다.
    const phase = d.configurationData.phase;
    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Sihas Monitor",
            description: "디버깅 모드",
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
                description: "체크하세요",
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

  // 4. INSTALL / UPDATE
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치/업데이트 신호');
    return res.status(200).send({ installData: {} });
  }

  // ★★★ 5. EVENT (여기가 핵심 수정!) ★★★
  if (d.lifecycle === 'EVENT') {
    console.log("🔍 [RAW DATA 확인]");
    // 들어온 데이터를 문자열로 바꿔서 통째로 출력 (짤림 없이)
    console.log(JSON.stringify(d, null, 2));
    
    // 강제로 소켓 쏴보기 (데이터 구조 무시하고 테스트)
    if (d.eventData && d.eventData.deviceEvents) {
        d.eventData.deviceEvents.forEach(evt => {
            console.log(`👉 감지된 값: ${evt.value} (ID: ${evt.deviceId})`);
            
            // 앱으로 무조건 전송
            io.emit('sensor-update', {
                deviceId: evt.deviceId,
                status: evt.value,
                isOccupied: (evt.value === 'in' || evt.value === 'out')
            });
        });
    } else {
        console.log("⚠️ eventData 혹은 deviceEvents가 비어있음!");
    }

    console.log(`========================================\n`);
    return res.status(200).send({});
  }

  res.status(200).send({});
});

app.get('/keep-alive', (req, res) => res.send('Debug Mode On'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
