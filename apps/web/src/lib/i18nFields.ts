/**
 * Hindi and Telugu for text that comes from data rather than from screens: account-form
 * field labels, hints, dropdown choices and validation messages (lib/accountTypes.ts).
 *
 * Keyed by the English text, so accountTypes.ts stays plain English (it is unit-tested and the
 * saved values — e.g. "Hard of hearing", "Telangana" — stay in English in the database).
 * Only what people SEE is translated. Missing entries fall back to English.
 * First drafts — have a native speaker check them.
 */
import type { UiLang } from './i18n.js';

type Pair = { hi: string; te: string };

export const FIELD_TEXT: Record<string, Pair> = {
  // ---- field labels
  'Address': { hi: 'पता', te: 'చిరునామా' },
  'City': { hi: 'शहर', te: 'నగరం' },
  'State / UT': { hi: 'राज्य / केंद्र शासित प्रदेश', te: 'రాష్ట్రం / కేంద్రపాలిత ప్రాంతం' },
  'PIN code': { hi: 'पिन कोड', te: 'పిన్ కోడ్' },
  'Contact person': { hi: 'संपर्क व्यक्ति', te: 'సంప్రదించవలసిన వ్యక్తి' },
  'Their designation': { hi: 'उनका पद', te: 'వారి హోదా' },
  'Contact phone': { hi: 'संपर्क फ़ोन', te: 'సంప్రదింపు ఫోన్' },
  'Official email': { hi: 'आधिकारिक ईमेल', te: 'అధికారిక ఈమెయిల్' },
  'Full name': { hi: 'पूरा नाम', te: 'పూర్తి పేరు' },
  'Date of birth': { hi: 'जन्म तिथि', te: 'పుట్టిన తేదీ' },
  'Parent or guardian name': { hi: 'माता-पिता या अभिभावक का नाम', te: 'తల్లిదండ్రులు లేదా సంరక్షకుల పేరు' },
  'Parent or guardian phone': { hi: 'माता-पिता या अभिभावक का फ़ोन', te: 'తల్లిదండ్రులు లేదా సంరక్షకుల ఫోన్' },
  'Mobile number': { hi: 'मोबाइल नंबर', te: 'మొబైల్ నంబర్' },
  'Hearing': { hi: 'सुनने की क्षमता', te: 'వినికిడి' },
  'Preferred spoken / written language': { hi: 'पसंदीदा बोलने / लिखने की भाषा', te: 'ఇష్టమైన మాట్లాడే / రాసే భాష' },
  'Emergency contact name': { hi: 'आपातकालीन संपर्क का नाम', te: 'అత్యవసర సంప్రదింపు వ్యక్తి పేరు' },
  'Emergency contact phone': { hi: 'आपातकालीन संपर्क फ़ोन', te: 'అత్యవసర సంప్రదింపు ఫోన్' },
  'Hospital / clinic name': { hi: 'अस्पताल / क्लिनिक का नाम', te: 'ఆసుపత్రి / క్లినిక్ పేరు' },
  'Registration number': { hi: 'पंजीकरण संख्या', te: 'రిజిస్ట్రేషన్ నంబర్' },
  'Type': { hi: 'प्रकार', te: 'రకం' },
  'Departments using SignSphere': { hi: 'साइनस्फ़ियर इस्तेमाल करने वाले विभाग', te: 'సైన్‌స్ఫియర్ వాడే విభాగాలు' },
  'Number of beds': { hi: 'बिस्तरों की संख्या', te: 'పడకల సంఖ్య' },
  'Organisation name': { hi: 'संस्था का नाम', te: 'సంస్థ పేరు' },
  'Website': { hi: 'वेबसाइट', te: 'వెబ్‌సైట్' },
  'Number of Deaf members / students / staff': { hi: 'बधिर सदस्यों / छात्रों / कर्मचारियों की संख्या', te: 'బధిర సభ్యులు / విద్యార్థులు / సిబ్బంది సంఖ్య' },

  // ---- hints
  'e.g. Nursing Superintendent, Principal, HR Manager': { hi: 'जैसे नर्सिंग अधीक्षक, प्रधानाचार्य, HR मैनेजर', te: 'ఉదా. నర్సింగ్ సూపరింటెండెంట్, ప్రిన్సిపాల్, HR మేనేజర్' },
  'Required for users under 18.': { hi: '18 वर्ष से कम उम्र वालों के लिए ज़रूरी।', te: '18 ఏళ్ల లోపు వారికి తప్పనిసరి.' },
  'Helps SignSphere show the right defaults. Kept private to your account.': { hi: 'इससे साइनस्फ़ियर सही सेटिंग्स दिखाता है। यह आपके खाते तक ही निजी रहता है।', te: 'దీనితో సైన్‌స్ఫియర్ సరైన సెట్టింగ్‌లు చూపిస్తుంది. ఇది మీ ఖాతాకే గోప్యంగా ఉంటుంది.' },
  'Used by the Emergency screen.': { hi: 'आपातकाल स्क्रीन पर इस्तेमाल होता है।', te: 'అత్యవసర తెరలో వాడుతుంది.' },
  'Clinical establishment or state health-department registration number.': { hi: 'क्लिनिकल प्रतिष्ठान या राज्य स्वास्थ्य विभाग की पंजीकरण संख्या।', te: 'క్లినికల్ సంస్థ లేదా రాష్ట్ర ఆరోగ్య శాఖ రిజిస్ట్రేషన్ నంబర్.' },
  'e.g. Emergency, OPD, ENT.': { hi: 'जैसे आपातकाल, OPD, ENT।', te: 'ఉదా. అత్యవసర విభాగం, OPD, ENT.' },
  'Society / trust / company (CIN) / UDISE code.': { hi: 'सोसाइटी / ट्रस्ट / कंपनी (CIN) / UDISE कोड।', te: 'సొసైటీ / ట్రస్ట్ / కంపెనీ (CIN) / UDISE కోడ్.' },

  // ---- dropdown choices (saved in English; shown translated)
  'Deaf': { hi: 'बधिर', te: 'బధిరులు' },
  'Hard of hearing': { hi: 'कम सुनाई देना', te: 'తక్కువ వినికిడి' },
  'Prefer not to say': { hi: 'बताना नहीं चाहते', te: 'చెప్పకూడదనుకుంటున్నాను' },
  'Government hospital': { hi: 'सरकारी अस्पताल', te: 'ప్రభుత్వ ఆసుపత్రి' },
  'Private hospital': { hi: 'निजी अस्पताल', te: 'ప్రైవేట్ ఆసుపత్రి' },
  'Trust / charitable hospital': { hi: 'ट्रस्ट / धर्मार्थ अस्पताल', te: 'ట్రస్ట్ / ధార్మిక ఆసుపత్రి' },
  'Clinic': { hi: 'क्लिनिक', te: 'క్లినిక్' },
  'Primary health centre': { hi: 'प्राथमिक स्वास्थ्य केंद्र', te: 'ప్రాథమిక ఆరోగ్య కేంద్రం' },
  'School for the Deaf': { hi: 'बधिर विद्यालय', te: 'బధిరుల పాఠశాల' },
  'School / college / university': { hi: 'स्कूल / कॉलेज / विश्वविद्यालय', te: 'పాఠశాల / కళాశాల / విశ్వవిద్యాలయం' },
  'NGO': { hi: 'NGO (स्वयंसेवी संस्था)', te: 'NGO (స్వచ్ఛంద సంస్థ)' },
  'Company': { hi: 'कंपनी', te: 'కంపెనీ' },
  'Government office': { hi: 'सरकारी दफ़्तर', te: 'ప్రభుత్వ కార్యాలయం' },
  'Other': { hi: 'अन्य', te: 'ఇతర' },
  'English': { hi: 'अंग्रेज़ी', te: 'ఇంగ్లీష్' },
  'Hindi': { hi: 'हिन्दी', te: 'హిందీ' },
  'Telugu': { hi: 'तेलुगु', te: 'తెలుగు' },
  'Tamil': { hi: 'तमिल', te: 'తమిళం' },
  'Kannada': { hi: 'कन्नड़', te: 'కన్నడ' },
  'Malayalam': { hi: 'मलयालम', te: 'మలయాళం' },
  'Marathi': { hi: 'मराठी', te: 'మరాఠీ' },
  'Bengali': { hi: 'बांग्ला', te: 'బెంగాలీ' },
  'Gujarati': { hi: 'गुजराती', te: 'గుజరాతీ' },
  'Punjabi': { hi: 'पंजाबी', te: 'పంజాబీ' },
  'Odia': { hi: 'ओड़िया', te: 'ఒడియా' },
  'Urdu': { hi: 'उर्दू', te: 'ఉర్దూ' },

  // ---- states and union territories
  'Andaman and Nicobar Islands': { hi: 'अंडमान और निकोबार द्वीप समूह', te: 'అండమాన్ నికోబార్ దీవులు' },
  'Andhra Pradesh': { hi: 'आंध्र प्रदेश', te: 'ఆంధ్రప్రదేశ్' },
  'Arunachal Pradesh': { hi: 'अरुणाचल प्रदेश', te: 'అరుణాచల్ ప్రదేశ్' },
  'Assam': { hi: 'असम', te: 'అస్సాం' },
  'Bihar': { hi: 'बिहार', te: 'బీహార్' },
  'Chandigarh': { hi: 'चंडीगढ़', te: 'చండీగఢ్' },
  'Chhattisgarh': { hi: 'छत्तीसगढ़', te: 'ఛత్తీస్‌గఢ్' },
  'Dadra and Nagar Haveli and Daman and Diu': { hi: 'दादरा और नगर हवेली और दमन और दीव', te: 'దాద్రా నగర్ హవేలీ, డామన్ డయ్యూ' },
  'Delhi': { hi: 'दिल्ली', te: 'ఢిల్లీ' },
  'Goa': { hi: 'गोवा', te: 'గోవా' },
  'Gujarat': { hi: 'गुजरात', te: 'గుజరాత్' },
  'Haryana': { hi: 'हरियाणा', te: 'హర్యానా' },
  'Himachal Pradesh': { hi: 'हिमाचल प्रदेश', te: 'హిమాచల్ ప్రదేశ్' },
  'Jammu and Kashmir': { hi: 'जम्मू और कश्मीर', te: 'జమ్మూ కాశ్మీర్' },
  'Jharkhand': { hi: 'झारखंड', te: 'జార్ఖండ్' },
  'Karnataka': { hi: 'कर्नाटक', te: 'కర్ణాటక' },
  'Kerala': { hi: 'केरल', te: 'కేరళ' },
  'Ladakh': { hi: 'लद्दाख', te: 'లడఖ్' },
  'Lakshadweep': { hi: 'लक्षद्वीप', te: 'లక్షద్వీప్' },
  'Madhya Pradesh': { hi: 'मध्य प्रदेश', te: 'మధ్యప్రదేశ్' },
  'Maharashtra': { hi: 'महाराष्ट्र', te: 'మహారాష్ట్ర' },
  'Manipur': { hi: 'मणिपुर', te: 'మణిపూర్' },
  'Meghalaya': { hi: 'मेघालय', te: 'మేఘాలయ' },
  'Mizoram': { hi: 'मिज़ोरम', te: 'మిజోరం' },
  'Nagaland': { hi: 'नागालैंड', te: 'నాగాలాండ్' },
  'Odisha': { hi: 'ओडिशा', te: 'ఒడిశా' },
  'Puducherry': { hi: 'पुदुचेरी', te: 'పుదుచ్చేరి' },
  'Punjab': { hi: 'पंजाब', te: 'పంజాబ్' },
  'Rajasthan': { hi: 'राजस्थान', te: 'రాజస్థాన్' },
  'Sikkim': { hi: 'सिक्किम', te: 'సిక్కిం' },
  'Tamil Nadu': { hi: 'तमिलनाडु', te: 'తమిళనాడు' },
  'Telangana': { hi: 'तेलंगाना', te: 'తెలంగాణ' },
  'Tripura': { hi: 'त्रिपुरा', te: 'త్రిపుర' },
  'Uttar Pradesh': { hi: 'उत्तर प्रदेश', te: 'ఉత్తర ప్రదేశ్' },
  'Uttarakhand': { hi: 'उत्तराखंड', te: 'ఉత్తరాఖండ్' },
  'West Bengal': { hi: 'पश्चिम बंगाल', te: 'పశ్చిమ బెంగాల్' },

  // ---- validation messages
  'Enter a valid email address.': { hi: 'सही ईमेल पता लिखें।', te: 'సరైన ఈమెయిల్ చిరునామా రాయండి.' },
  'Enter a valid Indian phone number (10 digits).': { hi: 'सही भारतीय फ़ोन नंबर लिखें (10 अंक)।', te: 'సరైన భారతీయ ఫోన్ నంబర్ రాయండి (10 అంకెలు).' },
  'PIN code must be 6 digits.': { hi: 'पिन कोड 6 अंकों का होना चाहिए।', te: 'పిన్ కోడ్ 6 అంకెలు ఉండాలి.' },
  'Enter a valid website address.': { hi: 'सही वेबसाइट पता लिखें।', te: 'సరైన వెబ్‌సైట్ చిరునామా రాయండి.' },
  'Enter a whole number.': { hi: 'पूरी संख्या लिखें।', te: 'పూర్ణ సంఖ్య రాయండి.' },
  'Enter at least 2 characters.': { hi: 'कम से कम 2 अक्षर लिखें।', te: 'కనీసం 2 అక్షరాలు రాయండి.' },
  'Use 4–40 letters, numbers, / - or .': { hi: '4–40 अक्षर, अंक, / - या . इस्तेमाल करें', te: '4–40 అక్షరాలు, అంకెలు, / - లేదా . వాడండి' },
  'Enter the full address.': { hi: 'पूरा पता लिखें।', te: 'పూర్తి చిరునామా రాయండి.' },
  'Enter your date of birth.': { hi: 'अपनी जन्म तिथि लिखें।', te: 'మీ పుట్టిన తేదీ రాయండి.' },
  'Check the date of birth.': { hi: 'जन्म तिथि जाँचें।', te: 'పుట్టిన తేదీ సరిచూడండి.' },
  'List at least one department.': { hi: 'कम से कम एक विभाग लिखें।', te: 'కనీసం ఒక విభాగం రాయండి.' },
};

/** The English text in the interface language (English if there is no translation yet). */
export function trText(lang: UiLang, english: string | undefined): string {
  if (!english) return '';
  if (lang === 'en') return english;
  return FIELD_TEXT[english]?.[lang] ?? english;
}
