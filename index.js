const express = require('express');
const { SmartApp } = require('@smartthings/smartapp');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 1. 삼성 공식 SDK 설정
const smartApp = new SmartApp()
  .enableEventLogging(2) // 로그 자세히 보기
  .configureI18n()
  .page('mainPage', (context, page, configData) => {
    // 앱 설정 화면 (스마트폰에 뜰 화면)
    page.section('센서 설정', section => {
      section.deviceSetting('sensors')
        .capabilities(['contactSensor'])
        .permissions('rx') // 읽기(r), 실행(x) 권한 요청
        .required(true)
        .multiple(true)
        .name('감지할 센서 선택');
    });
  })
  .updated(async (context, updateData) => {
    // 설치/업데이트 완료 시 실행
    console.log('앱 설치 완료/업데이트됨!');
    // 구독(Subscription) 자동 등록
    await context.api.subscriptions.subscribeToDevices(
      context.config.sensors, 
      'contactSensor', 
      'contact', 
      'myDeviceEventHandler'
    );
  })
  .subscribedEventHandler('myDeviceEventHandler', (context, event) => {
    // 실제 센서 이벤트 발생 시 실행
    console.log(`센서 감지: ${event.deviceId} -> ${event.value}`);
    io.emit('sensor-update', {
      deviceId: event.deviceId,
      value: event.value
    });
  });

// 2. 서버 설정
app.use(express.json());

app.post('/webhook', (req, res, next) => {
  // 모든 요청을 삼성 SDK에게 넘김
  smartApp.handleHttpCallback(req, res);
});

// 서버 깨우기용
app.get('/keep-alive', (req, res) => res.send('SmartApp Server is Awake!'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
