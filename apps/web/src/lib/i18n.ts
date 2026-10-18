/**
 * Interface language: English, Hindi, Telugu.
 *
 * Translations are first drafts — have a native speaker check them, and fix them here (one
 * line per phrase, all three languages side by side). Missing keys fall back to English.
 * ISL glosses (the sign names, e.g. DOCTOR) stay in English capitals: that is how ISL is written.
 */
import { useCallback } from 'react';
import { useSettings } from '../state/settings.js';

export type UiLang = 'en' | 'hi' | 'te';

export const UI_LANGS: Array<{ code: UiLang; label: string; speech: string }> = [
  { code: 'en', label: 'English', speech: 'en-IN' },
  { code: 'hi', label: 'हिन्दी', speech: 'hi-IN' },
  { code: 'te', label: 'తెలుగు', speech: 'te-IN' },
];

type Phrase = { en: string; hi: string; te: string };

const D = {
  // navigation and shell
  'nav.home': { en: 'Home', hi: 'होम', te: 'హోమ్' },
  'nav.textToSign': { en: 'Text → Sign', hi: 'लिखें → संकेत', te: 'రాయండి → సంజ్ఞ' },
  'nav.voiceToSign': { en: 'Voice → Sign', hi: 'बोलें → संकेत', te: 'మాట → సంజ్ఞ' },
  'nav.signToText': { en: 'Sign → Text', hi: 'संकेत → लिखित', te: 'సంజ్ఞ → అక్షరాలు' },
  'nav.signToVoice': { en: 'Sign → Voice', hi: 'संकेत → आवाज़', te: 'సంజ్ఞ → మాట' },
  'nav.conversation': { en: 'Conversation', hi: 'बातचीत', te: 'సంభాషణ' },
  'nav.record': { en: 'Record', hi: 'रिकॉर्ड', te: 'రికార్డ్' },
  'nav.learn': { en: 'Learn', hi: 'सीखें', te: 'నేర్చుకోండి' },
  'nav.history': { en: 'History', hi: 'इतिहास', te: 'చరిత్ర' },
  'nav.emergency': { en: 'Emergency', hi: 'आपातकाल', te: 'అత్యవసరం' },
  'nav.settings': { en: 'Settings', hi: 'सेटिंग्स', te: 'సెట్టింగ్‌లు' },
  'nav.admin': { en: 'Admin', hi: 'एडमिन', te: 'అడ్మిన్' },
  'nav.more': { en: 'More', hi: 'और', te: 'మరిన్ని' },
  'nav.close': { en: 'Close', hi: 'बंद करें', te: 'మూసివేయి' },
  'nav.back': { en: 'Back', hi: 'वापस', te: 'వెనుకకు' },
  'nav.signIn': { en: 'Sign in', hi: 'साइन इन', te: 'సైన్ ఇన్' },
  'footer.disclaimer': {
    en: 'SignSphere is a learning and communication aid, not a replacement for a qualified ISL interpreter. Do not rely on it for medical, legal, or emergency interpretation. Sign recognition covers a limited vocabulary and makes mistakes.',
    hi: 'साइनस्फ़ियर सीखने और बातचीत में मदद करने वाला साधन है, यह योग्य ISL दुभाषिए की जगह नहीं लेता। चिकित्सा, कानूनी या आपातकालीन अनुवाद के लिए इस पर निर्भर न रहें। यह सीमित संकेत पहचानता है और गलती कर सकता है।',
    te: 'సైన్‌స్ఫియర్ నేర్చుకోవడానికి, మాట్లాడుకోవడానికి సహాయపడే సాధనం మాత్రమే; అర్హత కలిగిన ISL దుబాసీకి ఇది ప్రత్యామ్నాయం కాదు. వైద్య, చట్టపరమైన లేదా అత్యవసర అనువాదానికి దీనిపై ఆధారపడకండి. ఇది కొన్ని సంజ్ఞలను మాత్రమే గుర్తిస్తుంది, తప్పులు చేయవచ్చు.',
  },
  'footer.privacy': { en: 'Privacy', hi: 'गोपनीयता', te: 'గోప్యత' },
  'footer.terms': { en: 'Terms', hi: 'शर्तें', te: 'నిబంధనలు' },
  'footer.report': { en: 'Report a problem', hi: 'समस्या बताएँ', te: 'సమస్యను తెలపండి' },
  'lang.label': { en: 'Language', hi: 'भाषा', te: 'భాష' },
  'lang.note': {
    en: 'Hindi and Telugu translations are new — please report any mistakes.',
    hi: 'हिन्दी अनुवाद नया है — कोई गलती दिखे तो बताएँ।',
    te: 'తెలుగు అనువాదం కొత్తది — ఏవైనా తప్పులు కనిపిస్తే తెలపండి.',
  },

  // welcome
  'welcome.tagline': {
    en: 'Communication without barriers, in Indian Sign Language.',
    hi: 'भारतीय सांकेतिक भाषा में, बिना रुकावट बातचीत।',
    te: 'భారతీయ సంజ్ఞా భాషలో, అడ్డంకులు లేని సంభాషణ.',
  },
  'welcome.p1': { en: 'Sign to the camera and see it as text or speech.', hi: 'कैमरे के सामने संकेत करें और उसे लिखित या आवाज़ में पाएँ।', te: 'కెమెరా ముందు సంజ్ఞ చేయండి, అది అక్షరాలుగా లేదా మాటగా వస్తుంది.' },
  'welcome.p2': { en: 'Type or speak, and a 3D signer shows it in ISL.', hi: 'लिखें या बोलें, और 3D संकेतक उसे ISL में दिखाएगा।', te: 'రాయండి లేదా మాట్లాడండి, 3D సంజ్ఞాకారుడు దాన్ని ISLలో చూపిస్తాడు.' },
  'welcome.p3': { en: 'For individuals, hospitals and organisations.', hi: 'व्यक्तियों, अस्पतालों और संस्थाओं के लिए।', te: 'వ్యక్తులు, ఆసుపత్రులు, సంస్థల కోసం.' },
  'welcome.p4': { en: 'Your camera is processed on your device — video is never uploaded.', hi: 'कैमरा आपके डिवाइस पर ही चलता है — वीडियो कभी अपलोड नहीं होता।', te: 'కెమెరా మీ పరికరంలోనే పనిచేస్తుంది — వీడియో ఎప్పుడూ అప్‌లోడ్ కాదు.' },
  'welcome.start': { en: 'Get started', hi: 'शुरू करें', te: 'ప్రారంభించండి' },
  'welcome.haveLogin': { en: 'I already have a login', hi: 'मेरा लॉगिन पहले से है', te: 'నాకు ఇప్పటికే లాగిన్ ఉంది' },
  'welcome.continueAs': { en: 'Continue as {name}', hi: '{name} के रूप में जारी रखें', te: '{name}గా కొనసాగండి' },
  'welcome.emergency': { en: 'In an emergency?', hi: 'आपातकाल में?', te: 'అత్యవసరమా?' },
  'welcome.emergencyLink': { en: 'Open emergency cards', hi: 'आपातकालीन कार्ड खोलें', te: 'అత్యవసర కార్డులు తెరవండి' },
  'welcome.noLogin': { en: '— no login needed.', hi: '— लॉगिन की ज़रूरत नहीं।', te: '— లాగిన్ అవసరం లేదు.' },
  'welcome.qr': { en: 'Open on another device (QR code)', hi: 'दूसरे डिवाइस पर खोलें (QR कोड)', te: 'మరో పరికరంలో తెరవండి (QR కోడ్)' },
  'welcome.terms': { en: 'Terms of Use', hi: 'उपयोग की शर्तें', te: 'వినియోగ నిబంధనలు' },

  // home
  'home.welcome': { en: 'Welcome, {name}', hi: 'स्वागत है, {name}', te: 'స్వాగతం, {name}' },
  'home.lede': {
    en: 'Learn and communicate in Indian Sign Language. Your camera is processed entirely on this device — no video is uploaded, and it works offline once loaded.',
    hi: 'भारतीय सांकेतिक भाषा सीखें और उसमें बात करें। कैमरा पूरी तरह इसी डिवाइस पर चलता है — कोई वीडियो अपलोड नहीं होता, और एक बार खुलने के बाद यह बिना इंटरनेट भी चलता है।',
    te: 'భారతీయ సంజ్ఞా భాష నేర్చుకోండి, అందులో మాట్లాడండి. కెమెరా పూర్తిగా ఈ పరికరంలోనే పనిచేస్తుంది — వీడియో అప్‌లోడ్ కాదు, ఒకసారి తెరిచాక ఇంటర్నెట్ లేకున్నా పనిచేస్తుంది.',
  },
  'home.xp': { en: 'XP', hi: 'XP', te: 'XP' },
  'home.streak': { en: 'Day streak', hi: 'लगातार दिन', te: 'వరుస రోజులు' },
  'home.mastered': { en: 'Signs mastered', hi: 'सीखे गए संकेत', te: 'నేర్చుకున్న సంజ్ఞలు' },
  'home.recognise': { en: 'Signs it can recognise', hi: 'पहचाने जाने वाले संकेत', te: 'గుర్తించగల సంజ్ఞలు' },
  'home.recorded': { en: 'Signs you recorded', hi: 'आपके रिकॉर्ड किए संकेत', te: 'మీరు రికార్డ్ చేసిన సంజ్ఞలు' },
  'home.words': { en: 'Words it can translate', hi: 'अनुवाद होने वाले शब्द', te: 'అనువదించగల పదాలు' },
  'home.whatYouCanDo': { en: 'What you can do', hi: 'आप क्या कर सकते हैं', te: 'మీరు ఏమి చేయవచ్చు' },
  'home.card.textToSign': { en: 'Type English and see it in ISL gloss order, with fingerspelling for unknown words.', hi: 'अंग्रेज़ी लिखें और उसे ISL क्रम में देखें; अनजान शब्द उँगलियों से वर्तनी में दिखेंगे।', te: 'ఇంగ్లీష్‌లో రాయండి, దాన్ని ISL క్రమంలో చూడండి; తెలియని పదాలు వేళ్లతో స్పెల్లింగ్‌గా చూపిస్తారు.' },
  'home.card.voiceToSign': { en: 'Speak, and see the same translation. Falls back to typing if speech is unavailable.', hi: 'बोलें और वही अनुवाद देखें। आवाज़ न चले तो लिखकर करें।', te: 'మాట్లాడండి, అదే అనువాదం చూడండి. మాట పనిచేయకపోతే రాయవచ్చు.' },
  'home.card.signToText': { en: 'Sign to your camera and see the recognised sign. Limited vocabulary.', hi: 'कैमरे के सामने संकेत करें और पहचाना गया संकेत देखें। सीमित शब्द।', te: 'కెమెరా ముందు సంజ్ఞ చేయండి, గుర్తించిన సంజ్ఞ చూడండి. కొన్ని పదాలు మాత్రమే.' },
  'home.card.signToVoice': { en: 'The same recognition, spoken aloud for a hearing person.', hi: 'वही पहचान, सुनने वाले व्यक्ति के लिए बोलकर।', te: 'అదే గుర్తింపు, వినగలిగే వ్యక్తి కోసం బిగ్గరగా చదివి.' },
  'home.card.conversation': { en: 'A deaf and a hearing person take turns on one phone: signs become speech, speech becomes ISL.', hi: 'एक बधिर और एक सुनने वाला व्यक्ति एक ही फ़ोन पर बारी-बारी से: संकेत आवाज़ बनते हैं, आवाज़ ISL बनती है।', te: 'బధిరులు, వినగలిగేవారు ఒకే ఫోన్‌లో వంతులవారీగా: సంజ్ఞలు మాటలవుతాయి, మాటలు ISL అవుతాయి.' },
  'home.card.record': { en: 'Sign it once to the camera: it is recognised in Sign → Text and the 3D avatar signs it back.', hi: 'कैमरे के सामने एक बार संकेत करें: वह पहचाना जाएगा और 3D संकेतक उसे दोहराएगा।', te: 'కెమెరా ముందు ఒకసారి సంజ్ఞ చేయండి: అది గుర్తించబడుతుంది, 3D సంజ్ఞాకారుడు దాన్ని చేసి చూపిస్తాడు.' },
  'home.card.learn': { en: 'Lessons with camera practice and instant feedback. Streaks and spaced review.', hi: 'कैमरे से अभ्यास और तुरंत प्रतिक्रिया वाले पाठ।', te: 'కెమెరాతో సాధన, వెంటనే ఫీడ్‌బ్యాక్ ఉన్న పాఠాలు.' },
  'home.card.emergency': { en: 'Offline phrase cards and contacts. Works with no network, always free.', hi: 'बिना इंटरनेट चलने वाले वाक्य-कार्ड और संपर्क। हमेशा मुफ़्त।', te: 'ఇంటర్నెట్ లేకున్నా పనిచేసే వాక్య కార్డులు, కాంటాక్ట్‌లు. ఎల్లప్పుడూ ఉచితం.' },
  'home.card.history': { en: 'Everything signed, typed or spoken in this account, searchable.', hi: 'इस खाते में किए गए सभी संकेत, लिखा और बोला गया — खोज सकते हैं।', te: 'ఈ ఖాతాలో చేసిన సంజ్ఞలు, రాసినవి, మాట్లాడినవి అన్నీ — వెతకవచ్చు.' },
  'home.card.dataset': { en: 'Install Indian Sign Language signs so nobody has to record them first.', hi: 'भारतीय सांकेतिक भाषा के संकेत इंस्टॉल करें, ताकि किसी को पहले रिकॉर्ड न करना पड़े।', te: 'భారతీయ సంజ్ఞా భాష సంజ్ఞలను ఇన్‌స్టాల్ చేయండి, ఎవరూ ముందుగా రికార్డ్ చేయనక్కర్లేదు.' },
  'home.card.datasetTitle': { en: 'ISL dataset', hi: 'ISL डेटासेट', te: 'ISL డేటాసెట్' },
  'home.card.recordTitle': { en: '⏺ Record a sign', hi: '⏺ संकेत रिकॉर्ड करें', te: '⏺ సంజ్ఞను రికార్డ్ చేయండి' },
  'home.card.learnTitle': { en: 'Learning Hub', hi: 'सीखने का केंद्र', te: 'నేర్చుకునే కేంద్రం' },
  'home.card.conversationTitle': { en: '💬 Live Conversation', hi: '💬 सीधी बातचीत', te: '💬 ప్రత్యక్ష సంభాషణ' },

  // conversation
  'convo.title': { en: 'Live Conversation', hi: 'सीधी बातचीत', te: 'ప్రత్యక్ష సంభాషణ' },
  'convo.lede': {
    en: 'A deaf and a hearing person take turns on this device. Signs become text and speech; speech becomes text and ISL from the avatar.',
    hi: 'एक बधिर और एक सुनने वाला व्यक्ति इस डिवाइस पर बारी-बारी से बात करते हैं। संकेत लिखित और आवाज़ बनते हैं; आवाज़ लिखित और अवतार द्वारा ISL बनती है।',
    te: 'బధిరులు, వినగలిగేవారు ఈ పరికరంలో వంతులవారీగా మాట్లాడుకుంటారు. సంజ్ఞలు అక్షరాలు, మాటలుగా; మాటలు అక్షరాలు, అవతార్ ద్వారా ISLగా మారతాయి.',
  },
  'convo.signing': { en: '🤟 Signing', hi: '🤟 संकेत', te: '🤟 సంజ్ఞ' },
  'convo.speaking': { en: '🗣 Speaking', hi: '🗣 बोलना', te: '🗣 మాట' },
  'convo.signerHeading': { en: 'Deaf person: sign, then press Send', hi: 'बधिर व्यक्ति: संकेत करें, फिर भेजें दबाएँ', te: 'బధిరులు: సంజ్ఞ చేసి, పంపండి నొక్కండి' },
  'convo.speakerHeading': { en: 'Hearing person: speak or type, then press Send', hi: 'सुनने वाला व्यक्ति: बोलें या लिखें, फिर भेजें दबाएँ', te: 'వినగలిగేవారు: మాట్లాడండి లేదా రాయండి, తర్వాత పంపండి నొక్కండి' },
  'convo.orType': { en: 'Or type', hi: 'या लिखें', te: 'లేదా రాయండి' },
  'convo.send': { en: 'Send', hi: 'भेजें', te: 'పంపండి' },
  'convo.sendSpeak': { en: 'Send and speak', hi: 'भेजें और बोलें', te: 'పంపి, చదివి వినిపించు' },
  'convo.sendSign': { en: 'Send and sign', hi: 'भेजें और संकेत दिखाएँ', te: 'పంపి, సంజ్ఞ చూపించు' },
  'convo.undo': { en: '⌫ Undo sign', hi: '⌫ संकेत हटाएँ', te: '⌫ సంజ్ఞ తీసివేయి' },
  'convo.clear': { en: 'Clear', hi: 'साफ़ करें', te: 'తుడిచివేయి' },
  'convo.quick': { en: 'Quick replies', hi: 'तुरंत जवाब', te: 'త్వరిత జవాబులు' },
  'convo.speak': { en: '🎤 Speak', hi: '🎤 बोलें', te: '🎤 మాట్లాడండి' },
  'convo.stop': { en: '⏹ Stop listening', hi: '⏹ सुनना बंद करें', te: '⏹ వినడం ఆపు' },
  'convo.message': { en: 'Message', hi: 'संदेश', te: 'సందేశం' },
  'convo.placeholder': { en: 'e.g. Your appointment is at 3 pm', hi: 'जैसे: आपकी अपॉइंटमेंट 3 बजे है', te: 'ఉదా: మీ అపాయింట్‌మెంట్ 3 గంటలకు' },
  'convo.inIsl': { en: 'In ISL', hi: 'ISL में', te: 'ISLలో' },
  'convo.avatarEmpty': { en: "The hearing person's messages are signed here.", hi: 'सुनने वाले व्यक्ति के संदेश यहाँ संकेत में दिखेंगे।', te: 'వినగలిగేవారి సందేశాలు ఇక్కడ సంజ్ఞలుగా చూపిస్తారు.' },
  'convo.log': { en: 'Conversation', hi: 'बातचीत', te: 'సంభాషణ' },
  'convo.new': { en: 'New conversation', hi: 'नई बातचीत', te: 'కొత్త సంభాషణ' },
  'convo.empty': { en: 'Messages from both people appear here.', hi: 'दोनों के संदेश यहाँ दिखेंगे।', te: 'ఇద్దరి సందేశాలు ఇక్కడ కనిపిస్తాయి.' },
  'convo.signed': { en: '🤟 Signed', hi: '🤟 संकेत किया', te: '🤟 సంజ్ఞ చేశారు' },
  'convo.said': { en: '🗣 Said', hi: '🗣 कहा', te: '🗣 చెప్పారు' },
  'convo.signAgain': { en: '▶ Sign again', hi: '▶ फिर से संकेत', te: '▶ మళ్ళీ సంజ్ఞ' },
  'convo.sayAgain': { en: '🔊 Say again', hi: '🔊 फिर से बोलें', te: '🔊 మళ్ళీ చెప్పు' },
  'convo.autoSwitch': { en: 'Switch turns automatically after each message', hi: 'हर संदेश के बाद अपने-आप बारी बदलें', te: 'ప్రతి సందేశం తర్వాత వంతు ఆటోమేటిక్‌గా మారాలి' },
  'convo.speakAloud': { en: "Speak the signer's messages aloud", hi: 'संकेत करने वाले के संदेश बोलकर सुनाएँ', te: 'సంజ్ఞ చేసేవారి సందేశాలను బిగ్గరగా చదవాలి' },
  'convo.recognised': { en: 'Recognised signs appear here.', hi: 'पहचाने गए संकेत यहाँ दिखेंगे।', te: 'గుర్తించిన సంజ్ఞలు ఇక్కడ కనిపిస్తాయి.' },
  'convo.unsure': { en: 'Not sure about that sign — nothing was added. Try again a little slower.', hi: 'यह संकेत पक्का नहीं पहचाना — कुछ नहीं जोड़ा। थोड़ा धीरे फिर से करें।', te: 'ఆ సంజ్ఞ సరిగ్గా గుర్తించలేదు — ఏమీ చేర్చలేదు. కొంచెం నెమ్మదిగా మళ్ళీ చేయండి.' },
  'quick.yes': { en: 'Yes', hi: 'हाँ', te: 'అవును' },
  'quick.no': { en: 'No', hi: 'नहीं', te: 'కాదు' },
  'quick.repeat': { en: 'Please repeat', hi: 'कृपया दोहराइए', te: 'దయచేసి మళ్ళీ చెప్పండి' },
  'quick.slow': { en: 'Please speak slowly', hi: 'कृपया धीरे बोलिए', te: 'దయచేసి నెమ్మదిగా మాట్లాడండి' },
  'quick.write': { en: 'Please write it down', hi: 'कृपया लिखकर बताइए', te: 'దయచేసి రాసి చూపించండి' },
  'quick.notUnderstand': { en: 'I do not understand', hi: 'मुझे समझ नहीं आया', te: 'నాకు అర్థం కాలేదు' },
  'quick.thanks': { en: 'Thank you', hi: 'धन्यवाद', te: 'ధన్యవాదాలు' },
  'quick.wait': { en: 'Wait', hi: 'रुकिए', te: 'ఆగండి' },

  // emergency
  'em.title': { en: 'Emergency', hi: 'आपातकाल', te: 'అత్యవసరం' },
  'em.lede': { en: 'Show these cards to anyone who can help. Works offline, always free, no account needed.', hi: 'ये कार्ड किसी भी मदद करने वाले को दिखाएँ। बिना इंटरनेट चलता है, हमेशा मुफ़्त, खाते की ज़रूरत नहीं।', te: 'సహాయం చేయగలిగే ఎవరికైనా ఈ కార్డులు చూపించండి. ఇంటర్నెట్ లేకున్నా పనిచేస్తుంది, ఎల్లప్పుడూ ఉచితం, ఖాతా అవసరం లేదు.' },
  'em.call': { en: 'Call for help', hi: 'मदद के लिए कॉल करें', te: 'సహాయం కోసం కాల్ చేయండి' },
  'em.showCard': { en: 'Show a card', hi: 'कार्ड दिखाएँ', te: 'కార్డు చూపించండి' },
  'em.speak': { en: '🔊 Speak this aloud', hi: '🔊 इसे बोलकर सुनाएँ', te: '🔊 దీన్ని బిగ్గరగా చదువు' },
  'em.close': { en: 'Close', hi: 'बंद करें', te: 'మూసివేయి' },
  'em.contacts': { en: 'Emergency contacts', hi: 'आपातकालीन संपर्क', te: 'అత్యవసర కాంటాక్ట్‌లు' },
  'em.text': { en: '✉ Text for help', hi: '✉ मदद के लिए संदेश', te: '✉ సహాయం కోసం సందేశం' },
  'em.callBtn': { en: '☎ Call', hi: '☎ कॉल', te: '☎ కాల్' },
  'em.add': { en: 'Add contact', hi: 'संपर्क जोड़ें', te: 'కాంటాక్ట్ జోడించండి' },
  'em.name': { en: 'Name', hi: 'नाम', te: 'పేరు' },
  'em.phone': { en: 'Phone number', hi: 'फ़ोन नंबर', te: 'ఫోన్ నంబర్' },
  'em.svc.all': { en: 'All emergencies', hi: 'सभी आपातकाल', te: 'అన్ని అత్యవసరాలు' },
  'em.svc.police': { en: 'Police', hi: 'पुलिस', te: 'పోలీసులు' },
  'em.svc.fire': { en: 'Fire', hi: 'अग्निशमन', te: 'అగ్నిమాపక' },
  'em.svc.ambulance': { en: 'Ambulance', hi: 'एम्बुलेंस', te: 'అంబులెన్స్' },
  'em.cat.Identity': { en: 'About me', hi: 'मेरे बारे में', te: 'నా గురించి' },
  'em.cat.Urgent': { en: 'Urgent', hi: 'तुरंत', te: 'అత్యవసరం' },
  'em.cat.Medical': { en: 'Medical', hi: 'चिकित्सा', te: 'వైద్యం' },
  'em.cat.Contact': { en: 'Getting help', hi: 'मदद पाना', te: 'సహాయం పొందడం' },
} satisfies Record<string, Phrase>;

export type MessageKey = keyof typeof D;

/** Emergency phrase cards in all three languages — shown together, so anyone nearby can read one. */
export const EMERGENCY_PHRASES: Array<{ category: 'Identity' | 'Urgent' | 'Medical' | 'Contact' } & Phrase> = [
  { category: 'Identity', en: 'I am deaf. I cannot hear you.', hi: 'मैं बधिर हूँ। मुझे सुनाई नहीं देता।', te: 'నేను బధిర వ్యక్తిని. నాకు వినబడదు.' },
  { category: 'Identity', en: 'Please write it down for me.', hi: 'कृपया मेरे लिए लिखकर बताइए।', te: 'దయచేసి నాకోసం రాసి చూపించండి.' },
  { category: 'Identity', en: 'I need a sign language interpreter.', hi: 'मुझे सांकेतिक भाषा के दुभाषिए की ज़रूरत है।', te: 'నాకు సంజ్ఞా భాష దుబాసీ కావాలి.' },
  { category: 'Urgent', en: 'I need help now.', hi: 'मुझे अभी मदद चाहिए।', te: 'నాకు ఇప్పుడే సహాయం కావాలి.' },
  { category: 'Urgent', en: 'Call an ambulance.', hi: 'एम्बुलेंस बुलाइए।', te: 'అంబులెన్స్‌ను పిలవండి.' },
  { category: 'Urgent', en: 'Call the police.', hi: 'पुलिस को बुलाइए।', te: 'పోలీసులను పిలవండి.' },
  { category: 'Urgent', en: 'There is a fire.', hi: 'यहाँ आग लगी है।', te: 'ఇక్కడ మంటలు ఉన్నాయి.' },
  { category: 'Medical', en: 'I have pain here.', hi: 'मुझे यहाँ दर्द है।', te: 'నాకు ఇక్కడ నొప్పిగా ఉంది.' },
  { category: 'Medical', en: 'I need medicine.', hi: 'मुझे दवा चाहिए।', te: 'నాకు మందు కావాలి.' },
  { category: 'Medical', en: 'Take me to the hospital.', hi: 'मुझे अस्पताल ले चलिए।', te: 'నన్ను ఆసుపత్రికి తీసుకెళ్ళండి.' },
  { category: 'Contact', en: 'Please call my family.', hi: 'कृपया मेरे परिवार को फ़ोन कीजिए।', te: 'దయచేసి నా కుటుంబానికి ఫోన్ చేయండి.' },
  { category: 'Contact', en: 'I do not understand. Please show me.', hi: 'मुझे समझ नहीं आया। कृपया मुझे दिखाइए।', te: 'నాకు అర్థం కాలేదు. దయచేసి చూపించండి.' },
];

export function translateKey(lang: UiLang, key: MessageKey, vars?: Record<string, string | number>): string {
  const phrase: Phrase = D[key];
  let text = phrase[lang] || phrase.en;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

export function currentLang(value: unknown): UiLang {
  return value === 'hi' || value === 'te' ? value : 'en';
}

/** React hook: t('nav.home'), plus the current language. */
export function useT(): { t: (key: MessageKey, vars?: Record<string, string | number>) => string; lang: UiLang } {
  const { settings } = useSettings();
  const lang = currentLang(settings.uiLang);
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translateKey(lang, key, vars), [lang]);
  return { t, lang };
}

/** The speech voice to use for text in this interface language. */
export function speechLangFor(lang: UiLang, fallback: string): string {
  return lang === 'en' ? fallback : (UI_LANGS.find((l) => l.code === lang)?.speech ?? fallback);
}
