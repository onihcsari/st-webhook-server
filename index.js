const express = require('express');
const app = express();
app.use(express.json());

// SmartThings가 보낸 신호를 받을 경로
app.post('/webhook', (req, res) => {
  const data = req.body;

  // 1. 처음 등록할 때: 삼성이 보낸 확인 코드를 그대로 돌려줘야 함 (Confirmation)
  if (data.lifecycle === 'CONFIRMATION') {
    const confirmationUrl = data.confirmationData.confirmationUrl;
    console.log('방문 확인 URL:', confirmationUrl);
    // 이 URL로 접속하거나, 응답하면 인증 완료!
    return res.status(200).send({ targetUrl: confirmationUrl });
  }

  // 2. 실제 센서 데이터가 올 때 (EVENT)
  if (data.lifecycle === 'EVENT') {
    const events = data.eventData.deviceEvents;
    events.forEach(event => {
      console.log(`기기: ${event.deviceId}, 상태: ${event.value}`);
      // 여기서 소켓(Socket.io)을 통해 Ionic 앱으로 신호를 쏩니다.
    });
    return res.status(200).send();
  }

  res.status(200).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버가 ${PORT}번 포트에서 작동 중입니다.`));
