/**
 * Privacy notice and Terms of Use text in English, Hindi and Telugu.
 *
 * English is the legally binding version; the others are translations for convenience (the
 * screens say so). Keep all three in step when the English changes, and bump TERMS_VERSION
 * (lib/terms.ts) for the Terms. Have a lawyer review the English and a native speaker the rest.
 *
 * Light markup, rendered by components/RichText.tsx:
 *   **bold**            bold text
 *   [label](/path)      a link inside the app
 *   {where}             (privacy only) where data is stored — depends on the backend mode
 */
import type { UiLang } from './i18n.js';

export interface LegalSection {
  title: string;
  /** Paragraphs; a section with `list` shows them as bullet points. */
  body: string[];
  list?: boolean;
}

type ByLang<T> = Record<UiLang, T>;

export const PRIVACY: ByLang<LegalSection[]> = {
  en: [
    {
      title: 'Your camera',
      body: [
        'Camera video is processed on your device to track hand and body positions. **Video is never uploaded or stored.** When you record a sign, only the hand and body positions are saved, on this device.',
      ],
    },
    {
      title: 'Your microphone',
      body: [
        'Voice features use your browser’s speech recognition. Most browsers send the audio to the browser maker (for example Google for Chrome) to turn it into text. If you do not want that, type instead — every voice feature has a typing option.',
      ],
    },
    {
      title: 'Your account and history',
      list: true,
      body: [
        'Login: your email and a securely hashed password (we never see the password itself).',
        'Accounts: the details you enter on the account form, including hearing status for Individual accounts.',
        'History: the text, speech transcripts and recognised signs from your translations, stored per account.',
        'Where: {where}',
        'Error reports: if the app breaks, it sends the SignSphere team the error message, the screen, the app version and the type of device — never your words, recordings, email or login.',
        'Terms: the version of the Terms of Use you agreed to, and when, is kept with your login.',
        'We do not sell your data or use it for advertising.',
      ],
    },
    {
      title: 'Your rights',
      body: [
        'You can see and correct your details (Accounts → Edit), delete any history item or all of it (History), and delete your login with everything in it (Accounts → Delete my login and data). Sign recordings on a device can be deleted in Settings.',
      ],
    },
  ],
  hi: [
    {
      title: 'आपका कैमरा',
      body: [
        'हाथ और शरीर की स्थिति पहचानने के लिए कैमरा वीडियो आपके डिवाइस पर ही प्रोसेस होता है। **वीडियो कभी अपलोड या सेव नहीं होता।** जब आप कोई संकेत रिकॉर्ड करते हैं, तो केवल हाथ और शरीर की स्थितियाँ इसी डिवाइस पर सेव होती हैं।',
      ],
    },
    {
      title: 'आपका माइक्रोफ़ोन',
      body: [
        'आवाज़ वाली सुविधाएँ आपके ब्राउज़र की आवाज़ पहचान का इस्तेमाल करती हैं। ज़्यादातर ब्राउज़र आवाज़ को लिखित में बदलने के लिए ब्राउज़र बनाने वाली कंपनी (जैसे Chrome के लिए Google) को भेजते हैं। अगर आप ऐसा नहीं चाहते, तो टाइप करें — हर आवाज़ वाली सुविधा में टाइप करने का विकल्प है।',
      ],
    },
    {
      title: 'आपका खाता और इतिहास',
      list: true,
      body: [
        'लॉगिन: आपका ईमेल और सुरक्षित रूप से हैश किया गया पासवर्ड (हम असली पासवर्ड कभी नहीं देखते)।',
        'खाते: खाता फ़ॉर्म में भरी गई जानकारी, व्यक्तिगत खातों के लिए सुनने की स्थिति सहित।',
        'इतिहास: आपके अनुवादों का लिखा हुआ पाठ, बोली गई बातों का लिखित रूप और पहचाने गए संकेत, हर खाते के लिए अलग।',
        'कहाँ: {where}',
        'त्रुटि रिपोर्ट: ऐप में गड़बड़ी होने पर वह साइनस्फ़ियर टीम को त्रुटि संदेश, स्क्रीन, ऐप संस्करण और डिवाइस का प्रकार भेजता है — आपके शब्द, रिकॉर्डिंग, ईमेल या लॉगिन कभी नहीं।',
        'शर्तें: आपने उपयोग की शर्तों के किस संस्करण को और कब स्वीकार किया, यह आपके लॉगिन के साथ रखा जाता है।',
        'हम आपका डेटा नहीं बेचते और विज्ञापन के लिए इस्तेमाल नहीं करते।',
      ],
    },
    {
      title: 'आपके अधिकार',
      body: [
        'आप अपनी जानकारी देख और सुधार सकते हैं (खाते → बदलें), इतिहास की कोई भी प्रविष्टि या पूरा इतिहास हटा सकते हैं (इतिहास), और अपना लॉगिन सब कुछ सहित हटा सकते हैं (खाते → मेरा लॉगिन और डेटा हटाएँ)। डिवाइस की संकेत रिकॉर्डिंग सेटिंग्स में हटाई जा सकती हैं।',
      ],
    },
  ],
  te: [
    {
      title: 'మీ కెమెరా',
      body: [
        'చేతులు, శరీర స్థితిని గుర్తించడానికి కెమెరా వీడియో మీ పరికరంలోనే ప్రాసెస్ అవుతుంది. **వీడియో ఎప్పుడూ అప్‌లోడ్ కాదు, సేవ్ కాదు.** మీరు సంజ్ఞను రికార్డ్ చేసినప్పుడు, చేతులు, శరీర స్థితులు మాత్రమే ఈ పరికరంలో సేవ్ అవుతాయి.',
      ],
    },
    {
      title: 'మీ మైక్రోఫోన్',
      body: [
        'మాట ఫీచర్లు మీ బ్రౌజర్ మాట గుర్తింపును వాడతాయి. చాలా బ్రౌజర్లు ఆడియోను అక్షరాలుగా మార్చడానికి బ్రౌజర్ తయారీదారుకు (ఉదా. Chrome కోసం Google) పంపుతాయి. అది వద్దనుకుంటే టైప్ చేయండి — ప్రతి మాట ఫీచర్‌లో టైప్ చేసే ఎంపిక ఉంది.',
      ],
    },
    {
      title: 'మీ ఖాతా, చరిత్ర',
      list: true,
      body: [
        'లాగిన్: మీ ఈమెయిల్, సురక్షితంగా హాష్ చేసిన పాస్‌వర్డ్ (అసలు పాస్‌వర్డ్‌ను మేము ఎప్పుడూ చూడము).',
        'ఖాతాలు: ఖాతా ఫారంలో మీరు నింపిన వివరాలు, వ్యక్తిగత ఖాతాలకు వినికిడి స్థితితో సహా.',
        'చరిత్ర: మీ అనువాదాల్లోని అక్షరాలు, మాటల రాతప్రతులు, గుర్తించిన సంజ్ఞలు, ప్రతి ఖాతాకు వేరుగా.',
        'ఎక్కడ: {where}',
        'లోపాల నివేదికలు: యాప్‌లో లోపం వస్తే, అది సైన్‌స్ఫియర్ బృందానికి లోప సందేశం, తెర, యాప్ వెర్షన్, పరికరం రకం పంపుతుంది — మీ మాటలు, రికార్డింగ్‌లు, ఈమెయిల్ లేదా లాగిన్ ఎప్పుడూ కాదు.',
        'నిబంధనలు: మీరు వినియోగ నిబంధనల ఏ వెర్షన్‌కు, ఎప్పుడు అంగీకరించారో మీ లాగిన్‌తో భద్రపరుస్తాం.',
        'మేము మీ డేటాను అమ్మము, ప్రకటనల కోసం వాడము.',
      ],
    },
    {
      title: 'మీ హక్కులు',
      body: [
        'మీ వివరాలను చూసి సరిదిద్దవచ్చు (ఖాతాలు → మార్చండి), చరిత్రలో ఏదైనా అంశం లేదా మొత్తం తొలగించవచ్చు (చరిత్ర), మీ లాగిన్‌ను అందులోని అన్నింటితో సహా తొలగించవచ్చు (ఖాతాలు → నా లాగిన్, డేటా తొలగించండి). పరికరంలోని సంజ్ఞ రికార్డింగ్‌లను సెట్టింగ్‌లలో తొలగించవచ్చు.',
      ],
    },
  ],
};

export const PRIVACY_WHERE: ByLang<{ cloud: string; device: string }> = {
  en: {
    cloud: 'on SignSphere’s database (Supabase), protected so that only your login can read your data.',
    device: 'currently only in this browser (this-device mode).',
  },
  hi: {
    cloud: 'साइनस्फ़ियर के डेटाबेस (Supabase) पर, इस तरह सुरक्षित कि आपका डेटा केवल आपका लॉगिन पढ़ सके।',
    device: 'अभी केवल इसी ब्राउज़र में (केवल-इस-डिवाइस मोड)।',
  },
  te: {
    cloud: 'సైన్‌స్ఫియర్ డేటాబేస్‌లో (Supabase), మీ డేటాను మీ లాగిన్ మాత్రమే చదవగలిగేలా రక్షితంగా.',
    device: 'ప్రస్తుతం ఈ బ్రౌజర్‌లో మాత్రమే (ఈ-పరికరం-మాత్రమే మోడ్).',
  },
};

export const PRIVACY_FOOTER: ByLang<string> = {
  en: 'SignSphere is a communication aid, not a replacement for a qualified ISL interpreter. Sign data from the INCLUDE dataset is used under CC BY 4.0 (AI4Bharat).',
  hi: 'साइनस्फ़ियर बातचीत में मदद करने वाला साधन है, योग्य ISL दुभाषिए का विकल्प नहीं। INCLUDE डेटासेट (AI4Bharat) का संकेत डेटा CC BY 4.0 के तहत इस्तेमाल होता है।',
  te: 'సైన్‌స్ఫియర్ సంభాషణకు సహాయపడే సాధనం, అర్హత కలిగిన ISL దుబాసీకి ప్రత్యామ్నాయం కాదు. INCLUDE డేటాసెట్ (AI4Bharat) సంజ్ఞ డేటాను CC BY 4.0 కింద వాడుతున్నాం.',
};

export const TERMS: ByLang<LegalSection[]> = {
  en: [
    {
      title: 'What SignSphere is',
      body: [
        'SignSphere helps people learn and communicate in Indian Sign Language (ISL). It recognises a limited number of signs from your camera and shows English as ISL with a 3D signer. It is a **learning and communication aid**.',
      ],
    },
    {
      title: 'What it is not',
      body: [
        'SignSphere is **not a qualified ISL interpreter** and makes mistakes. Do not rely on it alone for medical, legal, financial or emergency decisions — use a qualified interpreter, or write things down, when it matters. In an emergency, call **112** directly. The Emergency screen helps you ask for help, but it can misread a sign and never calls anyone by itself.',
      ],
    },
    {
      title: 'Your login',
      body: [
        'Keep your password private; you are responsible for what is done with your login. One login can hold up to 10 accounts (Individual, Hospital or Organisation). Give true details — hospitals and organisations are checked before they are shown as verified. If you are under 18, use SignSphere with a parent\'s or guardian\'s permission.',
      ],
    },
    {
      title: 'Using it fairly',
      body: [
        'Do not misuse SignSphere: no abuse or harassment through reports, no false hospital or organisation details, no attempts to break its security or read other people\'s data, and no automated mass use. The SignSphere team may suspend a login that does this. A suspended login can still view and delete its own data.',
      ],
    },
    {
      title: 'Your data',
      body: [
        'Camera video stays on your device and is never uploaded. What is stored, where, and how to delete it is explained in the [Privacy notice](/privacy), which is part of these terms. You can delete your login and everything in it at any time from Accounts. When the app breaks, it may send the SignSphere team a short error report (what went wrong and on which screen — never your words, recordings or contact details) so it can be fixed.',
      ],
    },
    {
      title: 'Signs and content',
      body: [
        'Sign data from the INCLUDE dataset (AI4Bharat) is used under the CC BY 4.0 licence. Signs you record stay yours; you let SignSphere store them so they work on your devices. Translations and signs may be incomplete or regional — report anything wrong with [Report a problem](/feedback).',
      ],
    },
    {
      title: 'Changes and availability',
      body: [
        'SignSphere is provided as it is, while it is being developed, and may change or be unavailable at times. If these terms change in an important way, the app will ask you to agree again. These terms are governed by the laws of India.',
      ],
    },
  ],
  hi: [
    {
      title: 'साइनस्फ़ियर क्या है',
      body: [
        'साइनस्फ़ियर लोगों को भारतीय सांकेतिक भाषा (ISL) सीखने और उसमें बात करने में मदद करता है। यह आपके कैमरे से सीमित संख्या में संकेत पहचानता है और अंग्रेज़ी को 3D संकेतक के ज़रिए ISL में दिखाता है। यह एक **सीखने और बातचीत में मदद करने वाला साधन** है।',
      ],
    },
    {
      title: 'यह क्या नहीं है',
      body: [
        'साइनस्फ़ियर **योग्य ISL दुभाषिया नहीं है** और इससे गलतियाँ होती हैं। चिकित्सा, कानूनी, वित्तीय या आपातकालीन फ़ैसलों के लिए केवल इस पर भरोसा न करें — जब बात ज़रूरी हो, योग्य दुभाषिए की मदद लें या लिखकर बताएँ। आपात स्थिति में सीधे **112** पर कॉल करें। आपातकाल स्क्रीन मदद माँगने में सहायता करती है, लेकिन वह संकेत गलत पढ़ सकती है और अपने आप किसी को कॉल नहीं करती।',
      ],
    },
    {
      title: 'आपका लॉगिन',
      body: [
        'अपना पासवर्ड निजी रखें; आपके लॉगिन से जो भी किया जाता है, उसकी ज़िम्मेदारी आपकी है। एक लॉगिन में 10 तक खाते (व्यक्तिगत, अस्पताल या संस्था) हो सकते हैं। सही जानकारी दें — अस्पतालों और संस्थाओं को सत्यापित दिखाने से पहले जाँचा जाता है। अगर आपकी उम्र 18 से कम है, तो माता-पिता या अभिभावक की अनुमति से साइनस्फ़ियर इस्तेमाल करें।',
      ],
    },
    {
      title: 'सही इस्तेमाल',
      body: [
        'साइनस्फ़ियर का गलत इस्तेमाल न करें: रिपोर्ट के ज़रिए गाली-गलौज या उत्पीड़न नहीं, अस्पताल या संस्था की झूठी जानकारी नहीं, इसकी सुरक्षा तोड़ने या दूसरों का डेटा पढ़ने की कोशिश नहीं, और स्वचालित बड़े पैमाने पर इस्तेमाल नहीं। ऐसा करने वाले लॉगिन को साइनस्फ़ियर टीम निलंबित कर सकती है। निलंबित लॉगिन फिर भी अपना डेटा देख और हटा सकता है।',
      ],
    },
    {
      title: 'आपका डेटा',
      body: [
        'कैमरा वीडियो आपके डिवाइस पर ही रहता है और कभी अपलोड नहीं होता। क्या रखा जाता है, कहाँ, और उसे कैसे हटाएँ — यह [गोपनीयता सूचना](/privacy) में बताया गया है, जो इन शर्तों का हिस्सा है। आप कभी भी खाते स्क्रीन से अपना लॉगिन और उसका सब कुछ हटा सकते हैं। ऐप में गड़बड़ी होने पर वह साइनस्फ़ियर टीम को छोटी त्रुटि रिपोर्ट भेज सकता है (क्या गलत हुआ और किस स्क्रीन पर — आपके शब्द, रिकॉर्डिंग या संपर्क जानकारी कभी नहीं) ताकि उसे ठीक किया जा सके।',
      ],
    },
    {
      title: 'संकेत और सामग्री',
      body: [
        'INCLUDE डेटासेट (AI4Bharat) का संकेत डेटा CC BY 4.0 लाइसेंस के तहत इस्तेमाल होता है। आपके रिकॉर्ड किए संकेत आपके ही रहते हैं; आप साइनस्फ़ियर को उन्हें रखने देते हैं ताकि वे आपके डिवाइसों पर चल सकें। अनुवाद और संकेत अधूरे या क्षेत्रीय हो सकते हैं — कुछ भी गलत लगे तो [समस्या बताएँ](/feedback) से रिपोर्ट करें।',
      ],
    },
    {
      title: 'बदलाव और उपलब्धता',
      body: [
        'साइनस्फ़ियर जैसा है वैसा दिया जा रहा है, अभी इसका विकास चल रहा है, और यह बदल सकता है या कभी-कभी उपलब्ध न रहे। अगर ये शर्तें किसी ज़रूरी तरीके से बदलती हैं, तो ऐप आपसे दोबारा सहमति माँगेगा। ये शर्तें भारत के कानूनों के अधीन हैं।',
      ],
    },
  ],
  te: [
    {
      title: 'సైన్‌స్ఫియర్ అంటే ఏమిటి',
      body: [
        'సైన్‌స్ఫియర్ భారతీయ సంజ్ఞా భాష (ISL) నేర్చుకోవడానికి, దానిలో మాట్లాడటానికి సహాయపడుతుంది. ఇది మీ కెమెరా నుంచి పరిమిత సంఖ్యలో సంజ్ఞలను గుర్తిస్తుంది, ఇంగ్లీష్‌ను 3D సంజ్ఞాకారుడితో ISLగా చూపిస్తుంది. ఇది **నేర్చుకోవడానికి, సంభాషణకు సహాయపడే సాధనం**.',
      ],
    },
    {
      title: 'ఇది ఏది కాదు',
      body: [
        'సైన్‌స్ఫియర్ **అర్హత కలిగిన ISL దుబాసీ కాదు**, ఇది పొరపాట్లు చేస్తుంది. వైద్య, చట్టపరమైన, ఆర్థిక లేదా అత్యవసర నిర్ణయాలకు దీనిపై మాత్రమే ఆధారపడకండి — ముఖ్యమైనప్పుడు అర్హత కలిగిన దుబాసీని వాడండి, లేదా రాసి చూపించండి. అత్యవసర పరిస్థితిలో నేరుగా **112**కు ఫోన్ చేయండి. అత్యవసర తెర సహాయం అడగడానికి ఉపయోగపడుతుంది, కానీ అది సంజ్ఞను తప్పుగా చదవవచ్చు, ఎవరికీ తనంతట తాను ఫోన్ చేయదు.',
      ],
    },
    {
      title: 'మీ లాగిన్',
      body: [
        'మీ పాస్‌వర్డ్‌ను గోప్యంగా ఉంచండి; మీ లాగిన్‌తో జరిగే వాటికి మీరే బాధ్యులు. ఒక లాగిన్‌లో 10 వరకు ఖాతాలు (వ్యక్తిగత, ఆసుపత్రి లేదా సంస్థ) ఉండవచ్చు. నిజమైన వివరాలు ఇవ్వండి — ఆసుపత్రులు, సంస్థలను ధృవీకరించినట్టు చూపించే ముందు తనిఖీ చేస్తాం. మీకు 18 ఏళ్ల లోపు అయితే, తల్లిదండ్రులు లేదా సంరక్షకుల అనుమతితో సైన్‌స్ఫియర్ వాడండి.',
      ],
    },
    {
      title: 'సక్రమంగా వాడటం',
      body: [
        'సైన్‌స్ఫియర్‌ను దుర్వినియోగం చేయకండి: నివేదికల ద్వారా దూషణ లేదా వేధింపులు వద్దు, ఆసుపత్రి లేదా సంస్థ గురించి తప్పుడు వివరాలు వద్దు, దాని భద్రతను ఛేదించడానికి లేదా ఇతరుల డేటాను చదవడానికి ప్రయత్నాలు వద్దు, ఆటోమేటెడ్ భారీ వినియోగం వద్దు. ఇలా చేసే లాగిన్‌ను సైన్‌స్ఫియర్ బృందం నిలిపివేయవచ్చు. నిలిపివేసిన లాగిన్ ఇప్పటికీ తన డేటాను చూడగలదు, తొలగించగలదు.',
      ],
    },
    {
      title: 'మీ డేటా',
      body: [
        'కెమెరా వీడియో మీ పరికరంలోనే ఉంటుంది, ఎప్పుడూ అప్‌లోడ్ కాదు. ఏమి భద్రపరుస్తాం, ఎక్కడ, ఎలా తొలగించాలో [గోప్యతా ప్రకటన](/privacy)లో వివరించాం, అది ఈ నిబంధనలలో భాగం. మీరు ఎప్పుడైనా ఖాతాల తెర నుంచి మీ లాగిన్‌ను అందులోని అన్నింటితో సహా తొలగించవచ్చు. యాప్‌లో లోపం వస్తే, దాన్ని సరిచేయడానికి అది సైన్‌స్ఫియర్ బృందానికి చిన్న లోప నివేదిక పంపవచ్చు (ఏం తప్పు జరిగింది, ఏ తెరపై — మీ మాటలు, రికార్డింగ్‌లు లేదా సంప్రదింపు వివరాలు ఎప్పుడూ కాదు).',
      ],
    },
    {
      title: 'సంజ్ఞలు, కంటెంట్',
      body: [
        'INCLUDE డేటాసెట్ (AI4Bharat) సంజ్ఞ డేటాను CC BY 4.0 లైసెన్స్ కింద వాడుతున్నాం. మీరు రికార్డ్ చేసిన సంజ్ఞలు మీవే; అవి మీ పరికరాల్లో పనిచేసేలా వాటిని భద్రపరచడానికి సైన్‌స్ఫియర్‌కు అనుమతిస్తున్నారు. అనువాదాలు, సంజ్ఞలు అసంపూర్ణంగా లేదా ప్రాంతీయంగా ఉండవచ్చు — ఏదైనా తప్పుగా ఉంటే [సమస్య తెలపండి](/feedback) ద్వారా తెలియజేయండి.',
      ],
    },
    {
      title: 'మార్పులు, లభ్యత',
      body: [
        'సైన్‌స్ఫియర్ ఉన్నది ఉన్నట్టుగా, అభివృద్ధి దశలో అందిస్తున్నాం, ఇది మారవచ్చు లేదా అప్పుడప్పుడు అందుబాటులో లేకపోవచ్చు. ఈ నిబంధనలు ముఖ్యమైన రీతిలో మారితే, యాప్ మిమ్మల్ని మళ్ళీ అంగీకారం అడుగుతుంది. ఈ నిబంధనలు భారత చట్టాలకు లోబడి ఉంటాయి.',
      ],
    },
  ],
};
