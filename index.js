const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const d = req.body;
  console.log(`[신호 수신] ${d.lifecycle}`);

  // 1. PING & CONFIRMATION
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
            name: "Sihas People Counter",
            description: "센서 연결",
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
                description: "목록에서 기기를 선택하세요",
                type: "DEVICE",
                required: true,
                multiple: true,
                // ★ 수정됨: 'refresh' 기능이 있는 모든 기기를 보여줌
                // (Sihas 센서는 refresh 기능이 있어서 무조건 뜹니다)
                capabilities: ["refresh"], 
                permissions: ["r", "x"]
              }]
            }]
          }
        }
      });
    }
  }

  // 3. 설치 및 업데이트 (INSTALL / UPDATE)
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ [완료] 버튼 눌림! 데이터 저장 성공.');

    try {
      // 데이터 위치 찾기 (안전장치)
      let installedApp = d.installData ? d.installData.installedApp : d.updateData.installedApp;
      
      const selectedSensors = installedApp.config.sensors;
      console.log('------------------------------------------------');
      console.log(`감지된 기기 수: ${selectedSensors.length}개`);
      selectedSensors.forEach((sensor, index) => {
        console.log(`[${index + 1}] ID: ${sensor.deviceConfig.deviceId}`);
      });
      console.log('------------------------------------------------');

    } catch (e) {
      console.error('로그 출력 중 경미한 오류 (설치는 성공함):', e.message);
    }

    // 무조건 성공 응답
    return res.status(200).send({ installData: {} });
  }

  // 4. 이벤트 수신 (EVENT)
  if (d.lifecycle === 'EVENT') {
    console.log('이벤트 수신:', JSON.stringify(d.eventData, null, 2));
    return res.status(200).send({});
  }

  res.status(200).send({});
});

app.get('/keep-alive', (req, res) => res.send('Refresh Filter Alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
