const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// CORS 허용 (앱 연결 필수)
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

  // 3. INSTALL / UPDATE
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치/업데이트 완료');
    return res.status(200).send({ installData: {} });
  }

  // ★★★ 4. EVENT (여기가 수정되었습니다!) ★★★
  if (d.lifecycle === 'EVENT') {
    // 로그로 확인한 구조: d.eventData.events[...]
    const eventData = d.eventData;

    if (eventData && eventData.events) {
        // 배열 안에 있는 이벤트를 하나씩 꺼냅니다.
        eventData.events.forEach(item => {
            // "DEVICE_EVENT" 타입인지 확인하고, 실제 데이터를 꺼냄
            if (item.eventType === 'DEVICE_EVENT' && item.deviceEvent) {
                const event = item.deviceEvent; // 여기가 진짜 데이터!

                console.log(`⚡ [감지됨] ID: ${event.deviceId} / 값: ${event.value}`);

                // Sihas 센서 로직
                // (capability 이름이 길어서 포함 여부로 체크)
                if (event.capability.includes('inOutDirectionV2') || event.attribute === 'inOutDir') {
                    
                    const val = event.value; // in, out, ready
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
    } else {
        // events 배열이 없는 경우
        console.log("⚠️ 데이터 구조가 다름 (events 배열 없음)");
    }

    return res.status(200).send({});
  }

  res.status(200).send({});
});

app.get('/keep-alive', (req, res) => res.send('Structure Fixed!'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
