const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const d = req.body;
  console.log(`[신호 수신] ${d.lifecycle}`);

  // 1. PING & CONFIRMATION (기존 유지)
  if (d.lifecycle === 'PING') {
    return res.send({ pingData: { challenge: d.pingData.challenge } });
  }
  if (d.lifecycle === 'CONFIRMATION') {
    return res.send({ targetUrl: d.confirmationData.confirmationUrl });
  }

  // 2. 화면 설정 (여기가 핵심!)
  if (d.lifecycle === 'CONFIGURATION') {
    const phase = d.configurationData.phase;

    // 2-1. 권한 요청 (이제 권한을 요구합니다!)
    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Room Monitor",
            description: "센서 선택 테스트",
            id: "app",
            permissions: ["r:devices:*", "x:devices:*"], // ★ 권한 필수!
            firstPageId: "1"
          }
        }
      });
    }

    // 2-2. 센서 선택창 띄우기
    if (phase === 'PAGE') {
      return res.send({
        configurationData: {
          page: {
            pageId: "1",
            name: "센서 연결",
            complete: true,
            sections: [{
              name: "센서 목록",
              settings: [{
                id: "sensors", // 이 ID로 나중에 데이터를 찾습니다
                name: "접촉 센서 선택하세요",
                description: "방에 있는 센서 체크",
                type: "DEVICE",
                required: true,
                multiple: true,
                capabilities: ["contactSensor"], // 접촉 센서만 필터링
                permissions: ["r", "x"]
              }]
            }]
          }
        }
      });
    }
  }

  // 3. 설치 완료 (INSTALL)
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치 버튼 눌림!');
    
    // 사용자가 선택한 센서 정보가 여기 들어있습니다.
    const selectedSensors = d.configurationData.installedApp.config.sensors;
    console.log('선택된 센서 데이터:', JSON.stringify(selectedSensors, null, 2));

    return res.status(200).send({ installData: {} });
  }

  res.status(200).send({});
});

app.get('/keep-alive', (req, res) => res.send('Step 2 Alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
