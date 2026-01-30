const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// 로그 찍어서 신호 오는지 눈으로 확인
app.post('/webhook', (req, res) => {
  const d = req.body;
  console.log(`[신호 옴] 단계: ${d.lifecycle}`);

  // 1. URL 검증 (PING)
  if (d.lifecycle === 'PING') {
    return res.send({ pingData: { challenge: d.pingData.challenge } });
  }

  // 2. 인증 (CONFIRMATION)
  // (이미 인증은 통과했으므로 단순히 URL만 반환해도 됨)
  if (d.lifecycle === 'CONFIRMATION') {
    return res.send({ targetUrl: d.confirmationData.confirmationUrl });
  }

  // 3. 화면 설정 (CONFIGURATION)
  if (d.lifecycle === 'CONFIGURATION') {
    const phase = d.configurationData.phase;

    // 3-1. 초기화: "나 권한 필요 없어!"
    if (phase === 'INITIALIZE') {
      return res.send({
        configurationData: {
          initialize: {
            name: "Test Connection",
            description: "Just a connection test",
            id: "app",
            permissions: [], // ★ 중요: 권한 요청 0개
            firstPageId: "1"
          }
        }
      });
    }

    // 3-2. 화면: 센서 선택창 대신 그냥 안내 문구만
    if (phase === 'PAGE') {
      return res.send({
        configurationData: {
          page: {
            pageId: "1",
            name: "연결 테스트",
            complete: true,
            sections: [{
              name: "확인",
              settings: [{
                id: "info_text",
                name: "상태",
                description: "이 화면이 보이면 서버 연결 성공입니다.",
                type: "PARAGRAPH" // 기기 선택(DEVICE) 아님
              }]
            }]
          }
        }
      });
    }
  }

  // 4. 설치 (INSTALL) / 업데이트 (UPDATE)
  // 무조건 성공 리턴
  if (d.lifecycle === 'INSTALL' || d.lifecycle === 'UPDATE') {
    console.log('★ 설치 성공! (빈 껍데기 앱)');
    return res.status(200).send({ installData: {} });
  }

  // 그 외 모든 것 OK
  res.status(200).send({});
});

// 깨우기용
app.get('/keep-alive', (req, res) => res.send('Skeleton Alive!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
