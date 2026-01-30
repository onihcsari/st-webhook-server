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

  // 2. CONFIGURATION (화면 설정)
  if (d.lifecycle === 'CONFIGURATION') {
    const phase = d.configurationData.phase;

    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Sihas Monitor", // 이름 변경
            description: "피플 카운터 연결",
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
                description: "목록에 보이는 기기를 체크하세요",
                type: "DEVICE",
                required: true,
                multiple: true,
                // 아까 성공한 필터 그대로 유지
                capabilities: ["battery", "refresh", "switch", "contactSensor"], 
                permissions: ["r", "x"]
              }]
            }]
          }
        }
      });
    }
  }

  // 3. INSTALL (설치) / UPDATE (수정) - ★ 여기가 수정됨!
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ [완료] 버튼 눌림! 데이터 저장 시도...');

    try {
      // 데이터가 들어오는 주소를 정확히 구분해서 가져옴
      let installedApp;
      if (d.lifecycle === 'INSTALL') {
        installedApp = d.installData.installedApp;
      } else {
        installedApp = d.updateData.installedApp;
      }

      // 사용자가 선택한 기기 목록 가져오기
      const selectedSensors = installedApp.config.sensors;
      
      console.log('------------------------------------------------');
      console.log('★ 성공! 설치된 센서 목록:');
      
      // 보기 좋게 로그 찍기
      selectedSensors.forEach((sensor, index) => {
        console.log(`[${index + 1}] Device ID: ${sensor.deviceConfig.deviceId}`);
      });
      console.log('------------------------------------------------');

    } catch (e) {
      console.error('데이터 파싱 중 에러 발생 (하지만 설치는 진행됨):', e.message);
    }

    // 무조건 성공 응답 보냄
    return res.status(200).send({ installData: {} });
  }

  // 4. EVENT (실제 센서 동작) - 나중을 위해 남겨둠
  if (d.lifecycle === 'EVENT') {
    console.log('이벤트 발생:', JSON.stringify(d.eventData, null, 2));
    return res.status(200).send({});
  }

  res.status(200).send({});
});

app.get('/keep-alive', (req, res) => res.send('Final Fix Alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
