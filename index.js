const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const d = req.body;
  console.log(`[신호 수신] ${d.lifecycle}`);

  if (d.lifecycle === 'PING') {
    return res.send({ pingData: { challenge: d.pingData.challenge } });
  }
  if (d.lifecycle === 'CONFIRMATION') {
    return res.send({ targetUrl: d.confirmationData.confirmationUrl });
  }

  if (d.lifecycle === 'CONFIGURATION') {
    const phase = d.configurationData.phase;

    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Room Monitor",
            description: "모든 기기 연결 테스트",
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
            name: "시하스 센서 등록",
            complete: true,
            sections: [{
              name: "센서 목록",
              settings: [{
                id: "sensors",
                name: "피플 카운터 센서 선택",
                description: "목록에서 8개 센서를 모두 체크하세요",
                type: "DEVICE",
                required: true,
                multiple: true,
                // ★ 여기가 수정된 부분입니다!
                // 이 기기가 가진 'battery'와 'refresh' 능력으로 찾습니다.
                capabilities: ["battery", "refresh"], 
                permissions: ["r", "x"]
              }]
            }]
          }
        }
      });
    }  
  }

  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 기기 선택 및 설치 완료!');
    // 선택한 기기가 뭔지 로그로 확인
    const selected = d.configurationData.installedApp.config.sensors;
    console.log('선택된 기기들:', JSON.stringify(selected, null, 2));
    
    return res.status(200).send({ installData: {} });
  }

  res.status(200).send({});
});

app.get('/keep-alive', (req, res) => res.send('Filter Updated!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
