import { Step } from 'react-joyride';

export const getTourSteps = (lang: 'en' | 'id'): Record<string, Step[]> => {
  const t = {
    en: {
      dashboard_overview: {
        totalEvent: "This is the total number of events you have created.",
        currentPlan: "Current Status: Free Full Version. After you pay, the status will change to Paid Pay as you go.",
        availableCredits: "Here is the total credit you have. We provide 10 free credits for trial. Please top up or buy credits via the Buy Credit button.",
      },
      create_event: {
        createEvent: "Please click Create Event, then click Next.",
        createEventModal: "Please fill in the Event name and description. If there is no description, leave it as default AI PHOTOBOOTH EXPERIENCE. Choose a template or leave it default. You can configure this later in settings. Click CREATE, then click Next.",
        eventCard: "This is your event card. Launch to enter the app page, Settings to enter the Settings page to configure the app, Gallery to view the photo collection, Download ZIP if your event is finished, Backup to Google Drive to send photos directly to a Google Drive folder. Click LAUNCH."
      },
      app: {
        launch: "This is the main app page. The Launch button enters the Concept page and the Gallery button enters the generated photo collection. You can change this appearance in settings. Now let's go to the Settings page first. Click the Settings button."
      },
      settings: {
        globalIdentity: "This is the event name and description setting. For booth mode, you can choose according to your needs. Photobooth mode - no generate video button on the result and gallery pages. Videobooth mode - generate video button is available.",
        overlay: "Upload branding in PNG format. Create a design according to your photo size with PNG format, size 1920x1080 or for 4R print 1205x1795.",
        aiModel: "Optimal choice - we optimize the result of the concept you created. Booth choice - we maintain the face and pose accurately. Raw - if you are confident your prompt concept is good, suitable for men, women, and group photos, and doesn't need optimization, choose RAW, because raw 100% only follows the Prompt you created in the concept. Enable direct printing - activates the print button on the result and gallery pages.",
        background: "Here you can choose the background we provide or upload a background image or video. Make sure it fits the size. If you run the photobooth on a portrait screen, ensure the uploaded video or image is also portrait.",
        videoSettings: "This is the setting for generating video. Choose 480 or 720 according to your preference and don't forget to fill in the video prompt for maximum results.",
        cameraConfig: "You can set the camera here. If the camera is not straight, it can be rotated, and if the camera doesn't appear mirrored, you can check mirror camera preview.",
        outputConfig: "Choose the photo result size, landscape or portrait. Sizes 2:3 and 3:4 have been adjusted for 4R photo paper.",
        outputMonitor: "This is a feature for a 2nd monitor or 2nd device. Above is the launch live monitor button to preview the display. PHYSICS can be a random display like in space. Grid displays photos in boxes that can be clicked and scan QR too. Hero displays the last generated photo in full size. Slider displays the last photo large, with small photo navigation below it.",
        saveSettings: "Don't forget to save all your settings.",
        conceptTab: "Click the concept tab to continue."
      },
      concept: {
        useTemplate: "Click USE TEMPLATE to load one of our ready-to-use concepts.",
        loadTemplate: "Choose to load one of our free concepts.",
        createOwn: "Click CREATE YOUR OWN CONCEPT to build from scratch. You can upload a thumbnail, reference image, and write your own prompt. Use OPTIMIZE PROMPT to enhance your ideas.",
        thumbnail: "Upload a preview photo of the result, to be a preview when users enter the concept selection page or leave it default.",
        reference: "This is to upload a reference image or leave it blank if you only want to use a prompt. You can upload backgrounds, clothes, products, cars, etc., and you can also upload AI photo results to be used as references.",
        prompt: "Please enter the concept title in NEW CONCEPT and enter the prompt or command you want. If your prompt is detailed, just paste it here. You can use simple sentences, e.g., 'create a photo of a person wearing a neat black suit with a futuristic city background', then you need to press OPTIMIZE PROMPT, we will help make your prompt detailed and optimal. If you upload a reference photo, write it in the prompt, e.g., 'make everyone in the photo wear clothes like the reference, or use the product, or take a photo in this reference background', and click optimize prompt. If your reference photo is an AI photo, and you want to copy or follow the result like the reference photo, make a sentence in the prompt, 'make everyone in the photo exactly like the photo in this reference' and click the optimize button. The optimize button helps maximize or optimize your simple prompt to be more detailed and better.",
        saveConcept: "Don't forget to save the concept you have set.",
        back: "Click the back button above."
      },
      finish: {
        message: "Thank you for following this tutorial. If you have specific questions, you can contact us on WhatsApp, +62823-8123-0888. We will be happy to help.",
        finishBtn: "Finish"
      }
    },
    id: {
      dashboard_overview: {
        totalEvent: "Ini adalah total event yang kamu buat.",
        currentPlan: "Status saat ini Free Full Versi. Setelah anda membayar Status akan Berganti menjadi Paid Pay as to go.",
        availableCredits: "Disini total credit yang kamu punya, Kita memberikan Gratis 10 credit untuk uji coba, Silakan Topup atau beli Credit Melalui tombol Buy Credit.",
      },
      create_event: {
        createEvent: "Silakan klik Create Event, lalu klik Lanjut.",
        createEventModal: "Silakan isi nama Event dan deskripsi, jika tidak ada deskripsi biarkan defaultnya AI PHOTOBOOTH EXPERIENCE, pilih template atau biarkan default, nanti di settings bisa di atur lagi nama event, deskripsi dan template ini, dan Klik Create, lalu klik Lanjut.",
        eventCard: "Ini ada Card event anda, Lauch untuk masuk ke halaman app, settings masuk ke halaman Settings untuk mengatur app, Gallery untuk melihat koleksi dari hasil foto, download zip jika event anda telah selesai anda bisa download semua event dalam bentuk zip, backup to google drive - anda dapat langsung mengirim hasil foto ke folder google drive. Klik LAUNCH."
      },
      app: {
        launch: "Ini adalah halaman awal aplikasi, Tombol Launch untuk Masuk Ke Halaman Concept dan tombol gallery masuk ke koleksi foto yang sudah di generate. Anda dapat mengubah tampilan ini di setting. Sekarang kita masuk terlebih dulu ke halaman Settings. Klik tombol Settings."
      },
      settings: {
        globalIdentity: "Ini adalah pengaturan nama event deskripsi. Untuk booth mode kamu bisa memilih sesuai dengan kebutuhan. Photobooth mode - di halaman hasil foto dan di gallery tidak ada tombol generate video. Videobooth mode - di halaman hasil foto dan di gallery ada tombol generate video.",
        overlay: "Upload branding format png, Buatlah design sesuai dengan ukuran hasil fotomu dengan format PNG, ukurannya 1920x1080 atau untuk print 4r 1205x1795.",
        aiModel: "Pilihan optimal - kami mengoptimalkan hasil dari konsep yang anda buat. Pilihan booth - kami mempertahankan wajah dan pose dengan akurat. Raw - jika anda yakin dengan konsep prompt anda sudah bagus, bisa untuk pria, wanita dan group foto, dan tidak perlu di optimalkan pilih RAW, karna raw 100% hanya mengikuti Prompt yang anda buat di konsep. Enable direct printing - mengaktifkan tombol print di halaman result dan di gallery.",
        background: "Disini anda dapat memilih bacgkround yang kita sediakan atau bisa juga upload background image atau video, pastikan sesuai dengan ukuran, jika anda menjalankan photobooth di layar potrait pastikan video atau image yang di upload juga potrait.",
        videoSettings: "Ini adalah setingan untuk generate video. Pilih 480 atau 720 sesuai selera dan jangan lupa untuk mengisi prompt video agar hasilnya maximal.",
        cameraConfig: "Anda bisa setting kamera disini, jika kamera tidak lurus, bisa di putar, dan jika kamera tidak tampil mirror bisa ceklist pada mirror preview kamera.",
        outputConfig: "Pilih ukuran hasil dari foto, lanscape atau potrait, ukuran 2:3 dan 3:4 sudah kita sesuaikan dengan kertas foto 4R.",
        outputMonitor: "Ini adalah fitur untuk monitor ke 2 atau device ke 2, template tampilannya, di atas ada tombol lauch live monitor untuk melihat ke preview tampilannya. PHYSICS bisa tampilan acak seperti di space angkasa. Grid tampilan foto keluar kotak2 bisa di klik dan scan qr juga. Hero tampilan foto terakhir yang di generate dengan ukuran full. Slider tampilan foto terakhir besar, dan ada navigasi foto kecil di bawahnya.",
        saveSettings: "Jangan lupa untuk save semua pengaturan anda.",
        conceptTab: "Klik tombol concept untuk melanjutkan."
      },
      concept: {
        useTemplate: "Klik USE TEMPLATE untuk memilih konsep siap pakai dari kami.",
        loadTemplate: "Pilih load salah satu konsep gratis dari kami.",
        createOwn: "Klik CREATE YOUR OWN CONCEPT untuk membuat dari awal. Anda bisa upload thumbnail, gambar referensi, dan menulis prompt sendiri. Gunakan tombol OPTIMIZE PROMPT untuk menyempurnakan ide Anda.",
        thumbnail: "Upload foto preview hasilnya, untuk nanti jadi preview saat user masuk di halaman pilih konsep atau biarkan default.",
        reference: "Ini untuk upload gambar referensi atau kosongkan jika hanay ingin menggunakan prompt, anda bisa upload background, pakaian, produk, mobil dan lain2, dan juga anda dapat mengupload hasil foto ai untuk dijadikan sebagai referensi.",
        prompt: "Silakan masukan judul concept pada tulisan NEW CONCPET dan silakan masukan prompt atau perintah yang anda inginkan. Jika prompt anda sudah detail paste saja disini. Anda dapat menggunakan kalimat senderhana, misal 'buatkan foto orang menggunakan jas hitam yang rapi dengan latar kota futuristic', lalu anda perlu tekan OPTIMIZE PROMPT kami akan membantu membuat prompt anda menjadi detail dan optimal. Jika anda mengupload foto referensi, tuliskan juga di prompt misal: 'buat setiap foto sedang menggunakan pakaian seperti referensi, atau menggunakan produk, atau berfoto di latar referensi ini' dan klik optimize prompt. Jika foto referensi anda adalah foto ai, dan anda ingin meniru atau mengikut hasil seperti foto referensi, buat kalimat di prompt, 'buat setiap orang yang foto hasilnya persis seperti foto di referensi ini' dan klik tombol optimize. Tombol optimize membantu memaximal atau optimalkan prompt anda yang senderhana menjadi lebih detail dan bagus.",
        saveConcept: "Jangan lupa save concept yang sudah di atur.",
        back: "Klik tombol back di atas."
      },
      finish: {
        message: "Terimakasih telah mengikuti tutorial ini, jika ada pertanyaan yang spesifik, bisa hubungi kami di whatsapp, +62823-8123-0888 kami dengan senang hati akan membantu.",
        finishBtn: "Selesai"
      }
    }
  };

  const l = t[lang];

  return {
    dashboard_overview: [
      { target: '.tour-total-events', content: l.dashboard_overview.totalEvent, placement: 'bottom', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-current-plan', content: l.dashboard_overview.currentPlan, placement: 'bottom', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-available-credits', content: l.dashboard_overview.availableCredits, placement: 'bottom', skipBeacon: true, overlayClickAction: false },
    ],
    create_event: [
      { target: '.tour-create-event-btn', content: l.create_event.createEvent, placement: 'bottom', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-create-event-modal', content: l.create_event.createEventModal, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-event-card', content: l.create_event.eventCard, placement: 'top', skipBeacon: true, overlayClickAction: false },
    ],
    app: [
      { target: '.tour-app-page', content: l.app.launch, placement: 'center', skipBeacon: true, overlayClickAction: false },
    ],
    settings: [
      { target: '.tour-global-identity', content: l.settings.globalIdentity, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-overlay', content: l.settings.overlay, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-ai-model', content: l.settings.aiModel, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-background', content: l.settings.background, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-video-settings', content: l.settings.videoSettings, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-camera-config', content: l.settings.cameraConfig, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-output-config', content: l.settings.outputConfig, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-output-monitor', content: l.settings.outputMonitor, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-save-settings', content: l.settings.saveSettings, placement: 'top', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-concept-tab', content: l.settings.conceptTab, placement: 'bottom', skipBeacon: true, overlayClickAction: false },
    ],
    concept: [
      { target: '.tour-use-template', content: l.concept.useTemplate, placement: 'top', skipBeacon: true, overlayClickAction: false, buttons: [], blockTargetInteraction: false },
      { target: '.tour-load-template', content: l.concept.loadTemplate, placement: 'top', skipBeacon: true, overlayClickAction: false, buttons: [], blockTargetInteraction: false },
      { target: '.tour-create-own', content: l.concept.createOwn, placement: 'top', skipBeacon: true, overlayClickAction: false, buttons: [], blockTargetInteraction: false },
      { target: '.tour-thumbnail', content: l.concept.thumbnail, placement: 'right', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-reference', content: l.concept.reference, placement: 'right', skipBeacon: true, overlayClickAction: false },
      { target: '.tour-optimize-prompt', content: l.concept.prompt, placement: 'top', skipBeacon: true, overlayClickAction: false, blockTargetInteraction: false },
      { target: '.tour-save-concept', content: l.concept.saveConcept, placement: 'top', skipBeacon: true, overlayClickAction: false, blockTargetInteraction: false },
    ],
    finish: [
      { target: 'body', content: l.finish.message, placement: 'center' }
    ]
  };
};
