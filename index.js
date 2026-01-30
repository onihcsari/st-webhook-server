const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

// Ionic 앱이 접속할 수 있도록 CORS 허용
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

// SmartThings에서 오는 모든 신호를 받는 곳
app.post('/webhook', async (req, res) => {
  const data = req.body;
  const lifecycle = data.lifecycle;

  console.log(`[SmartThings 신호 수신] 타입: ${lifecycle}`);

  // 1. [인증] 처음 URL 등록할 때 확인 절차
  if (lifecycle === 'CONFIRMATION') {
    const confirmationUrl = data.confirmationData.confirmationUrl;
    console.log('인증 URL 접속 시도:', confirmationUrl);
    try {
      await axios.get(confirmationUrl);
      console.log('>> 인증 성공!');
      return res.status(200).send({ targetUrl: confirmationUrl });
    } catch (e) {
      console.error('>> 인증 실패:', e.message);
      return res.status(500).send();
    }
  }

  // 2. [설치/업데이트] 스마트폰 앱에서 "완료" 눌렀을 때 (가장 중요!)
  // 여기서 200 OK를 안 보내주면 앱에서 "연결 오류"가 뜹니다.
  if (lifecycle === 'INSTALL' || lifecycle === 'UPDATE' || lifecycle === 'CONFIGURATION') {
    console.log('>> 앱 설치/업데이트 신호 확인 (OK 응답 전송)');
    return res.status(200).send({ installData: {} });
  }

  // 3. [이벤트] 실제 센서가 감지되었을 때
  if (lifecycle === 'EVENT') {
    const events = data.eventData.deviceEvents;
    events.forEach(event => {
      console.log(`>> 센서 감지! [${event.deviceId}] 값: ${event.value}`);
      // Ionic 앱으로 쏘기
      io.emit('sensor-update', {
        deviceId: event.deviceId,
        value: event.value,
        timestamp: new Date().toISOString()
      });
    });
    return res.status(200).send();
  }

  // 4. [기타] 핑(PING) 등 다른 신호는 무조건 OK
  res.status(200).send();
});

// 서버 깨우기용 주소 (브라우저 접속용)
app.get('/keep-alive', (req, res) => {
  res.send('서버가 깨어있습니다! (Server is Awake)');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
