// Central localization catalog. Arabic is the key; English is the value.
// `translateText` is pure: it never touches the DOM and returns null when no
// complete translation exists, so callers can preserve the original string.
//
// Keep this file the single source of UI copy. New user-facing strings belong
// in EN_UI (or EN_PAT when they contain a number), and generated HTML should
// call tx()/use the DOM translator rather than branching on LANG.

export const EN_UI = {
  'مكتبتي':'My Library','القائمة':'Menu','الأقسام':'Sections','اطوِ الشريط':'Collapse sidebar','افتح القائمة':'Open menu',
  'محادثة جديدة':'New chat','المكتبة':'Library','أضف كتاب':'Add book','اقتباساتي':'My quotes','تظليلاتي':'My highlights','مراجعة اليوم':"Today's review",'قاموسي':'My glossary','خريطة أفكاري':'Idea map','الإعدادات':'Settings','أقرأ حالياً':'Currently reading','المحادثات':'Chats',
  'وش تبي تقرأ اليوم؟':'What do you want to read today?','أكمل':'Continue','الفصل':'Chapter','اسأل مكتبتك…':'Ask your library…','أرسل':'Send','أوقف':'Stop','انسخ':'Copy','انسخت':'Copied','يكتب…':'Typing…','شيل الفقرة':'Remove passage','ارفع كتاب: PDF أو EPUB أو نص':'Upload a book: PDF, EPUB or text',
  'أكمل القراءة':'Continue reading','مكانك':'Your place','ما بدأته':'Not started','هذا مكانك في':'Here’s your place in','لقيت أكثر من كتاب، اختر:':'I found more than one book — pick one:','أفتح لك مراجعة اليوم.':"Opening today's review.",'تفضل، أضف كتابك.':'Go ahead, add your book.',
  'ارجع':'Back','ارجع للشات':'Back to chat','ارجع للمكتبة':'Back to library','ناقش':'Discuss','السابقة':'History','المحادثات السابقة':'Previous chats','ما فيه محادثات محفوظة.':'No saved chats.','رسالة':'messages',
  'اشرح':'Explain','اسألني':'Quiz me','ناقشني':'Debate me','اربط':'Connect','اشرح لي':'Explain this to me','اسألني في اللي قريته':'Quiz me on what I read','ناقشني في فكرة هالفصل':"Debate me on this chapter's idea",'اربط هالفصل بكتبي الثانية':'Connect this chapter to my other books','اشرح لي هالفقرة':'Explain this passage',
  'اسمح بالكتاب كامل':'Allow the whole book','إغلاق':'Close','وش اللي ما وضح؟ أو أرسل مباشرة':"What wasn't clear? Or just send",'اكتب سؤالك أو رأيك…':'Write your question or view…','اختر وضع أو اكتب سؤالك.':'Pick a mode or write your question.','نص الفصول اللي بعد مكانك ما ينرسل إلا إذا سمحت بالكتاب كامل.':"Chapters after your place aren't sent unless you allow the whole book.",
  'اضبط الذكاء من':'Set up AI in','أول: رابط الـAPI واسم النموذج والمفتاح.':'first: API URL, model name and key.','(ما وصل رد)':'(no reply)','(انوقف)':'(stopped)','وصل الرد':'Reply arrived','افتح':'Open','انقطع الرد، أرسل رسالة جديدة للمتابعة.':'Reply was cut off — send a new message to continue.','تراجع':'Undo','رجع التظليل':'Highlight restored','رجعت المحادثة':'Chat restored','هذي كتب تجريبية عشان تجرب التطبيق. أضف كتبك من «أضف».':'These are sample books so you can try the app. Add your own with “Add”.',
  'ابحث في النصوص والتظليلات والملاحظات':'Search texts, highlights and notes','باقي المكتبة':'Rest of the library','مكتبتك فاضية. اضغط «أضف» والصق نص أو ارفع ملف.':'Your library is empty. Tap “Add” and paste text or upload a file.','تصدير المكتبة':'Export library','استيراد مكتبة':'Import library','جهّز للذكاء':'Prepare for AI','+ أضف':'+ Add','بحث':'Search',
  'خلّصته':'Finished','ما فتحته بعد':'Not opened yet','اليوم':'today','أمس':'yesterday','قبل شوي':'just now','ما قريت شي هالأسبوع بعد.':"You haven't read anything this week yet.",'في العناوين':'In titles','في النصوص':'In texts','في تظليلاتي':'In my highlights','في ملاحظاتي':'In my notes','أهم فكرة في جلسة':'Key idea from a session',
  'حاول تتذكّر الجواب قبل ما تفتحه. البطاقة ترجع لك بعد يوم، ثم أسبوع، ثم شهر.':'Try to recall the answer before revealing it. The card returns after a day, a week, then a month.','اضغط لترى الجواب':'Tap to see the answer','تذكّرتها':'I remembered','ما تذكّرت':'I forgot','خلّصت مراجعة اليوم.':"You're done for today.",'الباقي يرجع لك في وقته.':'The rest comes back on schedule.','ما عندك بطاقات اليوم.':'No cards today.','ما فيه بطاقات بعد.':'No cards yet.','وش الفكرة اللي ظللتها هنا؟':"What's the idea you highlighted here?",'تطبيق':'Applied',
  'البطاقات تنضاف لما تقرأ أقسام فيها وقفات استرجاع أو تظلّل شي «مهم»، وترجع لك بعد يوم، ثم أسبوع، ثم شهر.':'Cards are added when you read sections with recall pauses or highlight something “Important”, and come back after a day, a week, then a month.','راجعت 10 بطاقات اليوم، وهذا يكفي. كمّل بكرة.':"You reviewed 10 cards today — that's enough. Continue tomorrow.",
  'كل المصطلحات من كل مصادرك. تضيف مصطلح بتحديده في النص ثم «مصطلح».':'All terms from all your sources. Add one by selecting text, then “Term”.','ابحث في المصطلحات':'Search terms','بدون تعريف':'No definition','ما فيه مصطلح بهالاسم.':'No term by that name.','قاموسك فاضي. حدّد كلمة وأنت تقرأ واختر «مصطلح».':'Your glossary is empty. Select a word while reading and choose “Term”.','ظهر في':'Appears in',
  'كل نقطة فكرة ظلّلتها أو مصطلح. النقاط الكبيرة مصطلحات تكرّرت في أكثر من مصدر، والخطوط الذهبية روابطك أنت.':'Each dot is an idea you highlighted or a term. Big dots are terms shared across sources; gold lines are your own links.','ظلّل أفكار وأنت تقرأ، وبتظهر هنا.':'Highlight ideas as you read and they’ll show up here.','مصطلح مشترك':'Shared term','تكبير':'Zoom in','تصغير':'Zoom out','ملاءمة':'Fit',
  'رفيق القراءة':'Reading companion','أي خدمة متوافقة مع':'Any service compatible with','، مثل DeepSeek. المفتاح ينحفظ في هالمتصفح بهالجهاز بس، وما يدخل في «تصدير المكتبة».':', such as DeepSeek. The key stays in this browser on this device and is never included in “Export library”.','رابط الـAPI':'API URL','اسم النموذج':'Model name','المفتاح':'API key','أظهر':'Show','أخفِ':'Hide',
  'نموذج يقرأ الصور (اختياري، للـPDF الممسوح)':'Vision model (optional, for scanned PDFs)','اسم نموذج الرؤية':'Vision model name','رابطه (فاضي = نفس الرابط فوق)':'Its URL (empty = same as above)','مفتاحه (فاضي = نفس المفتاح)':'Its key (empty = same key)','احفظ':'Save','جرّب الاتصال':'Test connection','امسح المفتاح':'Clear key','لغة الواجهة':'Interface language','محتوى الكتب ما يتأثر، وكل كتاب ياخذ اتجاهه من لغته.':"Book content isn't affected; each book keeps its own direction.",
  'البطاقة: أفكار الفصل ومصطلحاته ومواضيعه. تنكتب مرة وحدة لكل فصل، وبها يعرف الرفيق كتبك بدون ما يقرأها كاملة مع كل سؤال.':'A card holds a chapter’s ideas, terms and topics. It’s written once per chapter, so the companion knows your books without reading them in full on every question.','انحفظت.':'Saved.','في هالمتصفح بس.':'In this browser only.','أجرّب…':'Testing…','الاتصال شغّال.':'Connection works.','ما اشتغل.':"Didn't work.",'انمسح المفتاح.':'Key cleared.',
  'الفهرس':'Contents','علامة مرجعية هنا':'Bookmark here','جلسة قراءة':'Reading session','ناقش الكتاب':'Discuss the book','ابحث في الكتاب':'Search in book','خيارات العرض':'Display options','الوضع الليلي':'Dark mode','الوضع النهاري':'Light mode',
  'مهم':'Important','ما فهمت':'Unclear','سؤال':'Question','اشرحها لي':'Explain this','مصطلح':'Term','معنى':'Meaning','اقتباس':'Quote','أدوات التحديد':'Selection tools','حدّد أي نص عشان تطلع أدوات التظليل والشرح':'Select any text to bring up highlight and explain tools','إخفاء التلميح':'Dismiss hint','حاشية':'Footnote',
  'العرض':'Display','الوضع':'Theme','فاتح':'Light','ورقي':'Sepia','ليلي':'Dark','الخط':'Font','النسخ':'Naskh','الأميري':'Amiri','حجم الخط':'Font size','عادي':'Normal','تباعد الأسطر':'Line spacing','واسع':'Wide','عرض النص':'Text width','ضيق':'Narrow','التشكيل':'Diacritics','ظاهر':'Shown','مخفي':'Hidden','تصغير الخط':'Smaller text','تكبير الخط':'Larger text',
  'ابحث في هالكتاب':'Search this book','كلمة أو جملة':'A word or phrase',
  'المقدّمة':'Introduction','خريطة الكتاب':'Book map','خريطة النص':'Text map','الخاتمة':'Conclusion','علاماتي':'My bookmarks','أهم أفكار جلساتي':'Key ideas from my sessions','احذف من المكتبة':'Delete from library','أقرأ':'Reading','ما بدأت':'Not started','خلّصت':'Done','الغلاف':'Cover',
  '→ ارجع للكتاب':'← Back to book','انسخها كلها':'Copy all','ملاحظاتي':'My notes','ملاحظة':'Note','عدّل الملاحظة':'Edit note','اربطه بـ…':'Link to…','بطاقة اقتباس':'Quote card','احذف التظليل':'Delete highlight','افتح في المصدر':'Open in source','مربوطة بـ':'Linked to',
  'أضف للمكتبة':'Add to library','لصق نص':'Paste text','رفع ملف':'Upload file','النوع':'Type','العنوان (اختياري)':'Title (optional)','النص':'Text','أضف':'Add','اختر ملف (.txt أو .md أو .epub)':'Choose a file (.txt, .md or .epub)','روح للصق':'Go to paste',
  'انضاف لمكتبتك':'Added to your library','انحذف من المكتبة':'Removed from library','صدّرت المكتبة':'Library exported','حطيت علامة هنا':'Bookmark added','شلت العلامة':'Bookmark removed','ربطتها':'Linked','شلت التظليل':'Highlight removed','انضاف لقاموسي':'Added to glossary','حدّد داخل فقرة وحدة':'Select within a single paragraph','انسخت، الصقه في أي AI':'Copied — paste it into any AI','كل الفصول جاهزة للذكاء':'All chapters are ready for AI','انزل للنص وحط العلامة':'Scroll into the text to place a bookmark','انسخت كل التظليلات':'Copied all highlights',
  'في نهايتها بسألك: وش أهم فكرة قريتها؟':"At the end I'll ask: what was the key idea you read?",'أوقف الجلسة':'Stop session','تخطّي':'Skip','احفظ وكمّل':'Save and continue','وش أهم فكرة قريتها؟':'What was the key idea you read?','من ذاكرتك، قبل ما تكمل.':'From memory, before you continue.',
  'افتح في الكتاب':'Open in book','كل اقتباس تحفظه من «اقتباس» في شريط التحديد يطلع هنا.':'Every quote you save with “Quote” in the selection bar shows up here.','ما حفظت اقتباسات بعد. حدّد نص وأنت تقرأ واختر «اقتباس».':'No saved quotes yet. Select text while reading and choose “Quote”.','كل تظليلاتك من كل الكتب.':'All your highlights from every book.','الكل':'All','صفحة الكتاب':'Book page','ما فيه تظليلات هنا بعد.':'No highlights here yet.',
  'جاري التجهيز…':'Preparing…','احفظ الصورة':'Save image','شارك':'Share','معاينة قبل الحفظ':'Preview before saving','العنوان':'Title','المؤلف':'Author','الفصول':'Chapters','احفظ في المكتبة':'Save to library','إلغاء':'Cancel','تحويل PDF':'PDF conversion','ابدأ':'Start','أفكار':'Ideas',
  'الملف':'Profile','القراءة':'Reading','الرفيق الذكي':'AI companion','الخصوصية والبيانات':'Privacy & data','المظهر واللغة':'Appearance & language','عن التطبيق':'About','أقسام الملف':'Profile sections',
  'قارئ':'Reader','أهلاً،':'Hello,','اسم العرض':'Display name','لون الصورة':'Avatar color','أقرأ منذ':'Reading since','بالأرقام':'By the numbers','كتب':'Books','فصول خلّصتها':'Chapters finished','تظليلات':'Highlights','ملاحظات':'Notes','اقتباسات':'Quotes','مصطلحات':'Terms',
  'إعدادات القارئ الافتراضية':'Reader defaults','يتبع الجهاز':'Follow device','مزيج الأصوات الافتراضي':'Default ambient sound mix','يتوفر مع ميزة الأصوات.':'Available with the sounds feature.','يتوفر مع ميزة الأصوات':'Available with the sounds feature','بدون':'None','أصوات':'Sounds',
  'الاتصال':'Connection','أسلوب الرد':'Reply style','اللغة':'Language','الطول':'Length','بسيطة فصحى':'Simple Modern Standard','خليجي':'Gulf dialect','مثل ما أكتب':'Match how I write','مختصر':'Brief','مفصّل':'Detailed','الوضع الافتراضي':'Default mode',
  'حماية من الحرق':'Spoiler protection','ما يكشف الرفيق تفاصيل فصول ما وصلتها.':"The companion won't reveal details of chapters you haven't reached.",'يرسل نص الكتاب كامل مع الأسئلة، وهذا يكلّف أكثر.':'Sends the whole book text with questions, which costs more.','جهّز كل الكتب':'Prepare all books','اضبط الاتصال أولاً':'Set up the connection first',
  'وش يشوف رفيق القراءة':'What the companion can see','حالة الفصول':'Chapter status','التظليلات':'Highlights','الملاحظات والملخصات':'Notes and summaries','الاقتباسات':'Quotes','القاموس':'Glossary',
  'الكتاب مخزّن على هالجهاز، والمقاطع اللي تسأل عنها تنرسل لمزوّد الذكاء اللي ضبطته.':'The book is stored on this device; the passages you ask about are sent to the AI provider you configured.',
  'بياناتك':'Your data','المساحة المستخدمة':'Storage used','غير متاح في هذا المتصفح':'Not available in this browser','مرّ أكثر من 30 يومًا على آخر نسخة احتياطية. صدّر مكتبتك عشان تحفظها.':"It's been over 30 days since your last backup. Export your library to keep it safe.",
  'امسح المحادثات':'Clear chats','امسح بطاقات الفصول':'Clear chapter cards','احذف كل البيانات':'Delete all data','امسح':'Clear','احذف':'Delete','احذف الكتاب':'Delete book',
  'يمسح كل محادثات الرفيق من هالجهاز.':'Deletes all companion chats from this device.','يمسح بطاقات الفصول اللي كتبها الذكاء. تقدر تجهّزها من جديد.':'Deletes the chapter cards written by the AI. You can prepare them again.','يحذف كل الكتب والتظليلات والمحادثات من هالجهاز، ولا يمكن التراجع. ما يمسّ إعدادات الاتصال.':'Deletes all books, highlights and chats from this device. This cannot be undone. Connection settings are untouched.',
  'اكتب «احذف» للتأكيد':'Type “delete” to confirm','انمسحت المحادثات':'Chats cleared','انمسحت بطاقات الفصول':'Chapter cards cleared','انحذفت كل البيانات':'All data deleted',
  'مظهر الواجهة':'Interface theme','الورقي ويتبع الجهاز من تبويب «القراءة».':'Paper and Follow device are in the “Reading” tab.','الإصدار':'Version','قارئ عربي على جهازك: كتبك وتظليلاتك تبقى عندك.':'An Arabic reader on your device: your books and highlights stay with you.','الخطوط: IBM Plex Sans Arabic وNoto Naskh Arabic وAmiri وAref Ruqaa، برخصة SIL Open Font License.':'Fonts: IBM Plex Sans Arabic, Noto Naskh Arabic, Amiri and Aref Ruqaa, under the SIL Open Font License.',
  'آخر قراءة':'Last read','التقدّم':'Progress','تاريخ الإضافة':'Date added','ترتيب المكتبة':'Sort library','تصفية حسب النوع':'Filter by type','طريقة العرض':'View','شبكة':'Grid','قائمة':'List','ما فيه عناصر من هالنوع.':'Nothing of this type yet.','جاهز':'Ready',
  'استيراد ملف مكتبة':'Import a library file','اختر ملف المكتبة (.json)':'Choose a library file (.json)','ملف تصدير من «تصدير المكتبة». يُضاف لمكتبتك الحالية.':'A file exported with “Export library”. It is merged into your current library.',
  'ابدأ القراءة':'Start reading','المترجم':'Translator','العنوان الأصلي':'Original title','ليش أقرأه':'Why read it','مراجعات مستحقة':'Reviews due','لم يبدأ':'Not started','المزيد':'More','غيّر الغلاف':'Change cover','أزل الغلاف':'Remove cover','تغيّر الغلاف':'Cover updated','انأزل الغلاف':'Cover removed','ما قدرت أقرأ الصورة':"Couldn't read the image",
  'جهّز الكتاب':'Prepare the book','يكتب المساعد بطاقة قصيرة لكل فصل عشان يعرف كتابك بدون ما يقرأه كامل مع كل سؤال':'The assistant writes a short card for each chapter so it knows your book without reading all of it on every question',
  'مطر':'Rain','رعد':'Thunder','ريح':'Wind','نار حطب':'Campfire','أمواج':'Waves','ريح صحراء':'Desert wind','ضجيج أبيض':'White noise','ضجيج هادئ':'Calm noise','تعذّر تحميل الصوت، تأكد من الاتصال':'Could not load the sound. Check your connection.','أصوات المطر والنار والريح والأمواج والرعد في نسخة الويب من مكتبتي.':'Rain, fire, wind, waves and thunder are in the web version of My Library.','الأصوات الطبيعية تسجيلات من Freesound برخصة CC0، لا تشترط ذكر أصحابها ونذكرهم شكرًا:':'Nature sounds are recordings from Freesound under CC0. No credit is required; we thank the recordists:','ضجيج بني':'Brown noise','مطر هادئ':'Quiet rain','ليلة صحراء':'Desert night','عاصفة':'Storm','نار وريح':'Fire & wind',
  'شغّل الصوت':'Play sound','أوقف الصوت مؤقتاً':'Pause sound','مستوى الصوت العام':'Master volume','مستوى':'Volume','مزيجات':'Mixes','المؤقّت':'Timer','لين تنتهي جلسة القراءة':'Until the reading session ends','ابدأ جلسة قراءة من شريط القارئ أول':'Start a reading session from the reader bar first','حتى نهاية الجلسة':'Until session ends',
  'اسم المزيج':'Mix name','احفظ المزيج':'Save mix','احذف المزيج':'Delete mix','اختر صوتاً أول':'Pick a sound first','على بعض الجوالات يوقف الصوت لما تقفل الشاشة':'On some phones the sound stops when you lock the screen','افتح مازج الأصوات':'Open sound mixer','الصوت غير مدعوم في هالمتصفح':"Sound isn't supported in this browser",
  'يبدأ لما تشغّل الصوت وما فيه أصوات مختارة.':'Used when you press play with no sounds selected.',
  'وسّع المحادثة':'Expand chat','افتح الكتاب':'Open book','افتح الفقرة في الكتاب':'Open passage in book','نطاق السؤال':'Question scope','هذا الكتاب':'This book','مكتبتي كلها':'My whole library','هالأسبوع':'This week','أقدم':'Older',
  'أعد التسمية':'Rename','احذف المحادثة':'Delete chat','تحذف هالمحادثة؟':'Delete this chat?','خيارات المحادثة':'Chat options','اسم المحادثة':'Chat name','انحذفت المحادثة':'Chat deleted',
  'شكل لكل فكرة، والذهبي لروابطك وجسورك.':'One shape per idea. Gold: your links and bridges.','تصفية الخريطة':'Filter the map','ابحث في الخريطة':'Search the map','أعد ترتيب الخريطة':'Reset layout',
  'اسحب عقدة لتثبيتها، واضغط لتفاصيلها':'Drag a node to pin it, tap for details','أطلق كل التثبيتات':'Release all pins',
  'غيّر النوع':'Change type','ثبّت مكانها':'Pin in place','ألغِ التثبيت':'Unpin','الجيران':'Neighbors','الروابط':'Connections','قفزة':'1 hop','قفزتان':'2 hops',
  'رابطك':'Your link','يجمع بين كتابين':'Joins 2 books','ما لها روابط بعد':'No connections yet'
};
/* web-search strings */
Object.entries({
  'البحث في الإنترنت':'Web search',
  'البحث التلقائي في الإنترنت':'Automatic web search',
  'يشتغل تلقائيًا لما يحتاج السؤال معلومة حديثة أو من خارج الكتاب. مع وضع التفكير في DeepSeek يصير البحث أعمق وأغلى.':'Runs automatically when a question needs current or outside information. With DeepSeek thinking on, search becomes deeper and more expensive.',
  'البحث في الإنترنت قد يكلّف مبلغًا بسيطًا إضافيًا على حساب مزوّدك.':'Web search may cost a little extra on your provider account.',
  'أرسل بدون بحث':'Send without search',
  'بحث في الإنترنت':'Searched the web',
  'يبحث':'Searching',
  'تم البحث':'Search finished',
  'المصادر':'Sources',
  'تعذّر البحث':'Web search failed'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });
/* delete-book strings (added only if missing, so existing translations stay as they are) */
Object.entries({ 'احذف الكتاب':'Delete book','إلغاء':'Cancel','المحادثات':'Chats','يُحذف من هالجهاز:':'This will be deleted from this device:',
  'التظليلات':'Highlights','الملاحظات':'Notes','الاقتباسات':'Quotes','بطاقات المراجعة':'Review cards',
  'ومعها بطاقات الفصول وروابط الخريطة ومكان القراءة. ما يمكن التراجع.':'Along with chapter cards, map links and your reading position. This cannot be undone.',
  'صدّر هذا الكتاب أولاً':'Export this book first','صدّرت الكتاب':'Book exported','خيارات الكتاب':'Book options',
  'ما انحفظ: مساحة التخزين ممتلئة. صدّر مكتبتك واحذف ما لا تحتاجه.':'Not saved: storage is full. Export your library and delete what you do not need.',
  'ما انحفظ آخر تغيير على هالجهاز.':'Your last change was not saved on this device.','الملف كبير جدًا. ما تغيّر شي.':'The file is too large. Nothing was changed.',
  'ما تغيّر شي: الملف فيه بيانات غير صالحة.':'Nothing was changed: the file contains invalid data.' }).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });
/* collection strings */
Object.entries({ 'المجموعات':'Collections','أضف إلى مجموعة':'Add to a collection','مجموعة جديدة':'New collection','اسم المجموعة':'Collection name',
  'أنشئ':'Create','أنشئ وأضف':'Create and add','احذف المجموعة':'Delete collection','الكتب تبقى في مكتبتك.':'The books stay in your library.',
  'حذف المجموعة؟':'Delete this collection?','تنحذف المجموعة من قائمتك، وكتبها تبقى في مكتبتك.':'The collection is removed from your list; its books stay in your library.',
  'غير مصنّف':'Uncategorized','+ مجموعة':'+ Collection','تعديل':'Edit','خيارات المجموعة':'Collection options',
  'اختر مجموعة، أو أنشئ واحدة جديدة.':'Pick a collection, or create a new one.','ما فيه مجموعات بعد.':'No collections yet.',
  'ما فيه كتب في هذي المجموعة بعد.':'No books in this collection yet.','كل كتبك مصنّفة.':'All your books are filed.',
  'انضاف للمجموعة':'Added to the collection','انشال من المجموعة':'Removed from the collection','انضافت المجموعة':'Collection created',
  'انحذفت المجموعة':'Collection deleted','تغيّر الاسم':'Name changed' }).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });
/* ingest engine strings */
Object.entries({ 'تحويل الملف':'Converting the file','أجهّز محوّل الملفات…':'Preparing the converter…','أقرأ الصفحات…':'Reading pages…','أرتّب الفصول والحواشي…':'Arranging chapters and notes…',
  'ما قدرت أحوّل الملف.':'Could not convert the file.','يمكن الملف محمي أو تالف.':'The file may be protected or damaged.','طلع الناتج بشكل غير متوقّع، فما حفظت شي.':'The result had an unexpected shape, so nothing was saved.',
  'الملف محمي بكلمة مرور. افتحه في برنامج ثاني واحفظ نسخة بدون حماية، ثم ارفعها.':'This file is password-protected. Open it in another program, save an unprotected copy, and upload that.',
  'ما قدرت أفتح الملف. يمكن يكون تالف.':'Could not open the file. It may be damaged.','الملف فاضي.':'The file is empty.','ما قدرت أشغّل محوّل الملفات في هالمتصفح.':'Could not start the file converter in this browser.',
  'النص سليم':'The text looks good','راجع النص قبل ما تعتمد عليه':'Check the text before relying on it','هالملف يحتاج قراءة بالصور':'This file needs image reading',
  'نص هالملف ما ينقرأ (غالبًا صفحات ممسوحة كصور)، ويحتاج قراءة الصفحات كصور. هالميزة مو متوفرة بعد، فما راح أحفظه.':'The text in this file cannot be read (most likely scanned pages), so it needs the pages read as images. That feature is not available yet, so it will not be saved.',
  'أغلب النص مو عربي، فما قدرت أتحقق من جودته.':'Most of the text is not Arabic, so its quality could not be checked.','بعض الصفحات نصها مشوّه.':'Some pages have garbled text.',
  'بعض الحواشي ما انربطت بمكانها في النص.':'Some footnotes could not be linked to their place in the text.','بعض أرقام الحواشي في النص ما لقيت لها حاشية.':'Some footnote numbers in the text have no matching note.',
  'تقسيم الفقرات ممكن يكون غير دقيق.':'Paragraph breaks may be inaccurate.','الفهرس فيه فصول أكثر من اللي قدرت أحددها.':'The table of contents lists more chapters than were found.',
  'فيه صفحات كثيرة قبل أول فصل.':'There are many pages before the first chapter.','بعض الحروف المتصلة طلعت مقلوبة.':'Some joined letters came out reversed.',
  'كلمات كثيرة ما لقيتها في القاموس، يمكن فيه حروف مشوّهة.':'Many words are not in the dictionary; some letters may be garbled.','ما لقيت فصول واضحة.':'No clear chapters were found.',
  'فيه صفحات ما قدرت أقرأ نصها.':'Some pages could not be read.','ملاحظة على جودة التحويل.':'A note on conversion quality.','صفحات ما قدرت أقرأها:':'Pages that could not be read:',
  'اللغة':'Language','عربي':'Arabic','إنجليزي':'English','فصل':'chapters','أول صفحة من الفصل الأول':'First page of chapter 1','ما طلع نص.':'No text came out.','مكان الشكل':'Figure',
  'ارفع':'Upload','كتاب أو مقال أو ملف مكتبة: PDF أو EPUB أو Markdown أو نص. أتعرّف على نوعه بنفسي، وتقدر تصحّح قبل الحفظ.':'A book, an article or a library file: PDF, EPUB, Markdown or text. I recognize the kind myself, and you can correct it before saving.',
  'اختر ملف':'Choose a file','أو الصق نص':'Or paste text','كمّل':'Continue','أفلت الملف هنا':'Drop the file here',
  'ما أعرف أقرأ هالنوع من الملفات. جرّب PDF أو EPUB أو Markdown أو نص.':'I cannot read this kind of file. Try PDF, EPUB, Markdown or text.',
  'هالملف موجود في مكتبتك':'This file is already in your library','افتح الموجود':'Open the existing copy','أضف نسخة ثانية':'Add another copy',
  'ملف من «مكتبتي»':'A «مكتبتي» file','هذا ملف تصدير فيه':'This is an export file with','عنصر. تبي تضيفه لمكتبتك؟ ما ينحذف ولا يتغيّر شي موجود.':'items. Add them to your library? Nothing already there is deleted or changed.','استورد':'Import',
  'تنبيه: هالكتاب محوّل من ملف ويحتاج مراجعة':'Note: this book was converted from a file and needs review',
  'قائمة الكلمات العربية في محوّل الملفات:':'Arabic word list used by the file converter:','من Hermit Dave، مبنية من OpenSubtitles 2018. حوّلناها إلى جدول بحث. الرخصة:':'by Hermit Dave, built from OpenSubtitles 2018. Adapted into a lookup table. License:'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });
export const EN_PAT = [
  [/^أقرأ الصفحات… (\d+) من (\d+)$/, 'Reading pages… $1 of $2'],
  [/^يجمع بين (\d+) كتب$/, 'Joins $1 books'], [/^يجمع بين (\d+) كتابًا$/, 'Joins $1 books'],
  [/^(\d+) دقيقة$/, '$1 min'], [/^(\d+) نتيجة$/, '$1 results'], [/^(\d+) تظليل$/, '$1 highlights'], [/^بطاقة (\d+) من (\d+)$/, 'Card $1 of $2'],
  [/^قبل (\d+) أيام$/, '$1 days ago'], [/^قبل يومين$/, '2 days ago'], [/^قبل أسبوع$/, 'a week ago'], [/^قبل أسبوعين$/, '2 weeks ago'], [/^قبل (\d+) أسابيع$/, '$1 weeks ago'],
  [/^قراءة تقريبًا (\d+) دقيقة$/, 'About $1 min read'], [/^باقي (\d+) دقيقة من (\d+)\.$/, '$1 of $2 min left.'], [/^الفصل (\d+)$/, 'Chapter $1'], [/^باقي (\d+) دقيقة$/, '$1 min left'], [/^(\d+) من (\d+) فصل جاهز$/, '$1 of $2 chapters ready'], [/^لون (\d)$/, 'Color $1'],
  [/^التكلفة التقريبية: (\d+) فصل(?: في \d+ كتب)? = (\d+) طلب، قرابة (\d+) ألف توكن\.$/, 'Estimate: $1 chapters = $2 requests, about $3k tokens.'],
  [/^تحذف «(.+)» مع تظليلاته وملاحظاته؟$/, 'Delete “$1” with its highlights and notes?'],
  [/^صفحة (\d+) من (\d+)$/, 'Page $1 of $2'], [/^حاشية (\d+)$/, 'Footnote $1']
];
/* reading-template strings */
Object.entries({ 'معرض القوالب':'Template gallery','الكتاب':'The Book','حديث':'Modern','مخطوطة':'Manuscript','الأدوات':'Tools','الخط':'Type','جرّب القالب':'Try this template','أعد التلميحات':'Reset hints','رجعت التلميحات':'Hints reset',
  'ثلاثة قوالب للقراءة. كل كتاب يتذكّر قالبه، والافتراضي للكتب الجديدة من «الملف» ← «القراءة».':'Three reading templates. Each book remembers its own; the default for new books is in Profile → Reading.',
  'الافتراضي':'Default','استخدم الافتراضي':'Use the default','كيف تحب تقرأ هذا الكتاب؟':'How would you like to read this book?','اختر قالبًا، وتقدر تغيّره بأي وقت من «العرض».':'Pick a template. You can change it any time from Display.',
  'القالب':'Template','القالب الافتراضي':'Default template','للكتب اللي تفتحها أول مرة. تقدر تغيّر قالب أي كتاب من «العرض» وأنت تقرأ.':'For books you open for the first time. You can change any book’s template from Display while reading.',
  'طريقة القراءة':'Reading mode','تمرير':'Scroll','صفحات':'Pages','إخفاء الأدوات أثناء التمرير':'Hide tools while scrolling','لا':'No','نعم':'Yes',
  'ابحث':'Search','علامة':'Bookmark','العرض':'Display','أصوات':'Sounds','المؤقّت':'Timer','ناقش':'Discuss','خروج':'Exit','حاشية':'Note','افتح التظليل':'Open the highlight','فهمت':'Got it',
  'لتجربة ملء الشاشة الكاملة على الآيفون: اضغط «مشاركة» ثم «أضف إلى الشاشة الرئيسية».':'For true full screen on iPhone: tap “Share”, then “Add to Home Screen”.',
  'واجهة معاصرة واثقة: سطح محايد، وتسلسل واضح، وحركة سريعة، والقراءة تمريرًا أو صفحات.':'Confident and contemporary: neutral surfaces, clear hierarchy, crisp motion, scroll or pages.',
  'متن بالنسخ، وعناوين وأدوات بخط الواجهة، ومسافات واضحة بين الفقرات.':'Naskh body, headings and tools in the UI font, clear space between paragraphs.',
  'دائرة عائمة تفتح الأدوات حولها في قوس، وعلى الشاشة الضيقة في لوح قصير من الأسفل. ضغطة طويلة تفتح آخر أداة، وأيقونتها شارة صغيرة على الدائرة.':'A floating circle opens the tools in an arc around it, or in a short bottom sheet on narrow screens. Long-press opens the last tool, shown as a small badge on the circle.',
  'اضغط الدائرة لتفتح الأدوات. ضغطة طويلة تفتح آخر أداة استعملتها، وأيقونتها الصغيرة على الدائرة. حدّد أي نص لأدوات التظليل والشرح.':'Tap the circle to open the tools. Long-press opens the last tool you used; its icon is the small badge on the circle. Select any text for highlight and explain tools.',
  'كتاب مطبوع بعناية بين يديك: صفحتان متقابلتان على الشاشة الكبيرة، وصفحة واحدة على الجوال.':'A well-made printed book in your hands: a two-page spread on large screens, a single page on a phone.',
  'متن بالنسخ مضبوط من الطرفين بإزاحة أول السطر، وعناوين وترويسة بالأميري، وأرقام صفحات هندية، وحواشٍ أسفل الصفحة.':'Justified Naskh body with first-line indents, Amiri headings and running header, Arabic-Indic page numbers, footnotes at the foot of the page.',
  'شريط قراءة معلّق من أعلى الصفحة: اسحبه أو اضغطه فتنزل الأدوات كورقة مدسوسة.':'A ribbon bookmark hanging from the top edge: pull or tap it and the tools slide down like a page insert.',
  'اسحب الشريط المعلّق أو اضغطه لتنزل الأدوات. اضغط طرف الصفحة لتقلبها، ووسطها لترى مكانك. حدّد أي نص لأدوات التظليل والشرح.':'Pull or tap the hanging ribbon to bring down the tools. Tap the edge of the page to turn it, the middle to see where you are. Select any text for highlight and explain tools.',
  'مستوحى من المخطوطة العربية وأوائل الطباعة: ورق عتيق، وحبر أحمر للعناوين، وإطار مسطّر حول النص.':'Inspired by Arabic manuscripts and early print: aged paper, red-ink headings, a ruled frame around the text.',
  'متن بالأميري بتباعد أسطر أوسع للتشكيل، والرقعة للعناوين الكبيرة فقط بالحبر الأحمر، والتعقيبة أسفل كل صفحة.':'Amiri body with wider leading for diacritics, Ruqaa only for large headings in red ink, and the catchword at the foot of each page.',
  'قلم في الهامش يُخرج صندوق أقلام فيه الأدوات. ملاحظاتك حواشٍ في الهامش، وعلى الجوال علامات صغيرة في السطر تنفتح بلمسة.':'A reed pen in the margin opens a pen case holding the tools. Your notes are glosses in the margin; on a phone they are small inline marks that open with a tap.',
  'اضغط القلم في الهامش ليخرج صندوق الأقلام بالأدوات. ملاحظاتك تظهر حاشية بجانب سطرها. حدّد أي نص لأدوات التظليل والشرح.':'Tap the pen in the margin to open the pen case of tools. Your notes appear as glosses beside their line. Select any text for highlight and explain tools.' }).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });


/* quote-card strings (same catalog, merged so there is only one dictionary) */
Object.entries({
  'بطاقة اقتباس':'Quote card','الاقتباس':'Quote','ملاحظتي':'My note','سطر منك تحت الاقتباس (اختياري)':'A line of your own under the quote (optional)',
  'المقاس':'Size','القالب':'Template','الخط':'Font','ورقي':'Paper','داكن':'Dark','ذهبي على داكن':'Gold on dark','أبيض بسيط':'Minimal white',
  'نسخ':'Naskh','أميري':'Amiri','رقعة':'Ruqaa','التشكيل':'Diacritics','علامة «مكتبتي»':'“مكتبتي” watermark',
  'الكتاب فيه ملاحظة حقوق، فالعلامة مطفية افتراضيًا.':'This book has a rights note, so the watermark is off by default.',
  'النص المرافق':'Caption','وسوم (اختياري)':'Hashtags (optional)','مثال: قراءة كتب':'e.g. reading books','أعد التوليد':'Regenerate',
  'شارك':'Share','تيك توك':'TikTok','حمّل الصورة':'Download image','انسخ النص':'Copy caption',
  'في 9:16 نترك أعلى 12٪ وأسفل 20٪ فاضية لواجهة المنصة (المنطقة المخططة).':'In 9:16 the top 12% and bottom 20% stay empty for platform UI (hatched area).',
  'الاقتباس أطول من 280 حرف تقريبًا، فالخط بيصغر. الأفضل تقصّه.':'The quote is over ~280 characters, so the text shrinks. Consider trimming it.',
  'يتجاوز حدّ X (280).':'Over the X limit (280).',
  'نزّلت الصورة، ارفقها في X':'Image downloaded. Attach it in X.','لو ما انفتح X اضغط «افتح X».':'If X did not open, tap “Open X”.',
  'النص أطول من 280، قصّه قبل النشر.':'The text is over 280. Trim it before posting.',
  'افتح X':'Open X','تم':'Done','نزّلت الصورة':'Image downloaded','نسخت النص':'Caption copied','تعذّر النسخ':'Could not copy',
  'المشاركة بالصورة غير متاحة هنا. نزّلت الصورة ونسخت النص.':'Sharing with an image is not available here. Image downloaded and caption copied.',
  'المشاركة بالصورة غير متاحة هنا. نزّلت الصورة، والنص انسخه بزر «انسخ النص».':'Sharing with an image is not available here. Image downloaded; copy the caption with “Copy caption”.',
  'نزّل الصورة وارفعها من':'Download the image and upload it at','لا يوجد نص للاقتباس':'The quote is empty',
  'شرح من مكتبتي عن':'Explanation from My Library on','المصدر:':'Source:','نص المؤلف':"Author's text",'شرح من مكتبتي':'My Library explanation','كلامك أنت':'Your own words',
  'النص يختلف عن الأصل، فينسب لك لا للمؤلف.':'The text differs from the original, so it is attributed to you, not the author.',
  'الصورة':'Image','بطاقة اقتباس من كتاب':'Quote card from a book'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });

/* reader chrome, study sections and library/book page copy */
Object.entries({
  'التالي':'Next','السابق':'Previous','→ السابق':'← Previous','التالي ←':'Next →','الفصل التالي':'Next chapter','الفصل التالي ←':'Next chapter →',
  'خريطة الفصل':'Chapter map','وقفة استرجاع':'Recall pause','حاول تتذكّر قبل ما تشوف الجواب.':'Try to recall before you see the answer.',
  'توقّعي قبل القراءة':'Predict before reading','وش تتوقّع يقول هالنص؟ جملة أو جملتين تكفي.':'What do you expect this text to say? A sentence or two is enough.',
  'وش تتوقّع يقول هالفصل؟ جملة أو جملتين تكفي.':'What do you expect this chapter to say? A sentence or two is enough.','أتوقّع أنّ…':'I expect that…',
  'نهاية النص':'End of text','ثبّت ما قرأت':'Lock in what you read','ملخّصي بكلامي':'My summary in my own words','بدون ما ترجع للنص.':'Without going back to the text.',
  'الفكرة الأساسية هنا إنّ…':'The key idea here is…','أسئلة المراجعة':'Review questions','مصطلحات الفصل':'Chapter terms','المصطلح':'Term','التعريف':'Definition',
  'جدول المراجعة':'Review schedule','ارجع للأسئلة وعلّم بعد كل مراجعة.':'Go back to the questions and tick after each review.',
  'بعد يوم':'After a day','بعد أسبوع':'After a week','بعد شهر':'After a month','أسئلتي المفتوحة':'My open questions',
  'أسئلة طلعت لك وأنت تقرأ وما انجابت.':'Questions that came up while reading and were never answered.',
  'علّم الفصل: خلّصته':'Mark chapter: finished','خلّصت هالفصل':'Chapter finished','أهم ٣ أفكار':'Top 3 ideas','ما يبقى من الكتاب':'What stays with you',
  'وش بطبّق منه':'How I will apply it','بطبّق…':'I will apply…','من جديد':'again','ترجمة الفصل':'Translate chapter',
  'التخزين غير متاح.':'Storage is unavailable.','التغييرات ما راح تنحفظ بعد إغلاق الصفحة. افتح التطبيق في متصفح يسمح بـIndexedDB، أو صدّر مكتبتك قبل ما تطلع.':'Changes will not be saved after you close the page. Open the app in a browser that allows IndexedDB, or export your library before you leave.',
  'هالكتاب ممسوح ضوئيًا: نصه غير متاح بعد. الكتاب وملفه الأصلي محفوظان على جهازك، وبمجرد ما نضيف خاصية التعرف على الصور بيتكوّن النص.':'This book is scanned: its text is not available yet. The book and its original file are stored on your device; once image recognition is available, the text will be built.',
  'هذا الكتاب ما فيه فصول محفوظة. جرّب استيراده مرة ثانية أو احذفه من المكتبة.':'This book has no saved chapters. Try importing it again or delete it from the library.',
  'ممسوح ضوئيًا':'Scanned','ممسوح — بانتظار قراءة النص':'Scanned — waiting for text recognition','يُقرأ النص…':'Reading text…','ممسوح —':'Scanned —',
  'متوقف مؤقتًا':'Paused','متوقف — يكمل من آخر صفحة لاحقًا':'Paused — will continue from the last page later','متوقف — التخزين ممتلئ':'Paused — storage is full','متوقف — ملفات التعرف ما نزلت':'Paused — OCR files did not download',
  'يقرأ الآن…':'Reading now…','بانتظار البدء.':'Waiting to start.','يقرأ…':'Reading…','كمّل القراءة':'Continue reading','اقرأ النص على جهازي':'Read the text on my device','إيقاف مؤقت':'Pause',
  'نص هالكتاب ما انقرأ بعد: صفحاته صور ما لها طبقة نص. اضغط الزر تحت عشان أقرأ الصفحات على جهازك وأكوّن النص — الصفحات ما تطلع من جهازك أبدًا.':'This book’s text has not been read yet: its pages are images with no text layer. Use the button below so I can read the pages on your device and build the text — the pages never leave your device.',
  'قراءة النص محليًا ما تتوفر في نسخة الملف الواحد. استخدم النسخة المستضافة.':'Local text recognition is not available in the single-file build. Use the hosted version.',
  'الكتاب وملفه الأصلي محفوظان على جهازك فقط. إذا قفلت التبويب توقف القراءة، وتكمل من آخر صفحة بعدين.':'The book and its original file are stored only on your device. If you close the tab, recognition stops and continues from the last page later.',
  '← ارجع للمكتبة':'← Back to library','ممسوح —':'Scanned —',
  'التخزين غير متاح. ما قدرت أقرأ النص.':'Storage is unavailable. I could not read the text.','ملف الكتاب مو موجود على هالجهاز.':'The book file is not on this device.',
  'انتهت قراءة النص.':'Text recognition finished.','كتاب آخر يعالج الكتاب نفسه الآن.':'Another tab is processing this book right now.','ما قدرت أقرأ النص:':'Could not read the text:','خطأ غير معروف.':'Unknown error.',
  'ما فيه صفحات فاشلة.':'No failed pages.',
  'التكلفة التقديرية:':'Estimated cost:','التوكنات فقط؛ السعر غير معروف لهذا النموذج.':'Tokens only; pricing is unknown for this model.','التوكنات فقط؛ سعر هذا النموذج غير معروف.':'Tokens only; pricing is unknown for this model.',
  'السعر الآن:':'Price now:','خارج الذروة':'off-peak','ذروة':'peak','· تقدير وليس فاتورة.':'· an estimate, not a bill.','· الذروة':'· peak',
  'كلمة':'words','مقطع':'chunks','توكن إدخال':'input tokens','توكن إخراج':'output tokens','مقطعًا':'chunks',
  'المجموع: قرابة':'Total: about','دقيقة قراءة.':'min read.'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });

/* AI companion, connections, models and errors */
Object.entries({
  'الاتصالات':'Connections',
  'تقدر تضيف أكثر من اتصال: مفتاح لكل مزوّد أو نقطة نهاية مخصّصة. المفاتيح تنحفظ في هالمتصفح بهالجهاز بس، وما تدخل في «تصدير المكتبة».':'You can add more than one connection: a key per provider or a custom endpoint. Keys stay in this browser on this device and are never included in “Export library”.',
  'ما أضفت اتصالًا بعد. أضف مفتاح مزوّد أو نقطة نهاية محلية، وبعدها اختر الموديلات اللي تبيها.':'No connections yet. Add a provider key or a local endpoint, then choose the models you want.',
  'أضف اتصالًا':'Add connection','افتراضيات المهام':'Task defaults',
  'اختر من الموديلات المثبتة فقط. إذا ما اخترت لمهمة، تستخدم افتراضي الدردشة.':'Only pinned models are listed. If you leave a task unset, it follows the chat default.',
  'تغيير موديل المحادثة يخص المحادثة الحالية فقط؛ ما يغيّر الافتراضيات.':'Changing the chat model affects this conversation only; it does not change defaults.',
  'الدردشة':'Chat','الترجمة':'Translation','بطاقات الفصول':'Chapter cards',
  'الموديل الافتراضي للدردشة، وإذا ما اخترت لغيره':'The default chat model; other tasks fall back to it',
  'إذا ما اخترت، يستخدم افتراضي الدردشة':'If unset, the chat default is used','اتبع الدردشة':'Follow chat','لا موديلات مثبتة':'No pinned models',
  'مفتاح محفوظ':'Key saved','بلا مفتاح (محلي)':'No key (local)','بلا مفتاح':'No key','· مثبت:':' · Pinned:','· ما اخترت موديلات بعد':' · No models selected yet',
  'اختر الموديلات':'Choose models','أعد التسمية':'Rename','أعد تسمية الاتصال':'Rename connection','اسم الاتصال':'Connection name','اسم الاتصال (اختياري)':'Connection name (optional)','تغيّر اسم الاتصال.':'Connection renamed.',
  'المفتاح ينحفظ في هالمتصفح بهالجهاز بس، وما يدخل في «تصدير المكتبة». كل موديلات المزوّد تستخدم هالمفتاح.':'The key stays in this browser on this device and is never included in “Export library”. All of this provider’s models use this key.',
  'مثل: DeepSeek الشخصي':'e.g. My DeepSeek','الصق المفتاح عشان أكتشف المزوّد.':'Paste the key and I will detect the provider.',
  'نقطة نهاية مخصّصة أو محلية (Ollama، LM Studio)':'Custom or local endpoint (Ollama, LM Studio)','رابط الـAPI (Base URL)':'API URL (Base URL)','اسم الموديل':'Model name','أقصى توكنز للرد':'Max response tokens','نافذة السياق (توكنز)':'Context window (tokens)','مهلة أول رد (ثانية)':'First-byte timeout (seconds)',
  'اترك المفتاح فارغًا إذا كانت النقطة محلية.':'Leave the key empty if the endpoint is local.','اختر DeepSeek أو OpenAI أول.':'Choose DeepSeek or OpenAI first.','اختر المزوّد أول.':'Choose a provider first.',
  'رابط الـAPI لازم يبدأ بـhttp:// أو https://.':'The API URL must start with http:// or https://.','المفتاح مطلوب لهذا الرابط.':'A key is required for this URL.',
  'الصق مفتاح ':'Paste a key ','أول.':' first.','أتحقق من الموديلات…':'Checking models…','المفتاح غير صالح أو غير مصرّح له':'The key is invalid or not authorized',
  'تعذّر جلب /models (':'Could not fetch /models (','ما لقيت موديلًا. اكتب اسم الموديل أو جرّب /models من جديد.':'No model found. Type a model name or try /models again.',
  'المزوّد ما رجّع موديلًا افتراضيًا. أضف الاتصال ثم اختر موديلًا.':'The provider did not return a default model. Add the connection, then choose a model.',
  'أضفت':'Added','بموديل':' with model ','موديلات':'Models','نختار من':'Pick from','مرة وحدة. المثبت فقط يظهر في مفتاح المحادثة وفي افتراضيات المهام.':' Once. Only pinned models appear in the chat switcher and task defaults.',
  'ابحث عن موديل…':'Search models…','ابحث عن موديل':'Search models','أجيب الموديلات…':'Loading models…','اسم موديل آخر':'Another model name','انحفظت موديلات':'Saved models for ',
  'اختر الموديلات اللي تبيها. المثبت فقط يظهر في المحادثة.':'Choose the models you want. Only pinned models appear in chat.',
  'المزوّد ما رجّع قائمة موديلات. المثبت الحالي يبقى، وتقدر تضيف اسم موديل يدويًا.':'The provider returned no model list. Your current pins are kept; you can add a model name manually.',
  'تعذّر جلب قائمة الموديلات من':'Could not load the model list from ','). المثبت الحالي يبقى، وتقدر تضيف اسم موديل يدويًا.':'). Your current pins are kept; you can add a model name manually.',
  'غير متاح الآن':'Unavailable now','ما فيه موديلات تطابق البحث.':'No models match your search.','المزوّد ما رجّع موديلات. تقدر تضيف اسم موديل يدويًا.':'The provider returned no models. You can add a model name manually.',
  'اختر موديلًا':'Choose a model','اختر موديل المحادثة':'Choose chat model','غيّر الموديل':'Change model','اختر موديلًا لهذا الاتصال أول.':'Choose a model for this connection first.','أجرّب':'Testing',
  'اختر المزوّد':'Choose provider','اختر المزوّد…':'Choose provider…','آخر / مخصّص':'Other / custom','اتصال مخصّص. اكتب الرابط واسم الموديل.':'Custom connection. Enter the URL and model name.',
  'احذف الاتصال':'Delete connection','موديلات':'Models','تم التعرّف:':'Detected:','. المفتاح يبقى بهالجهاز.':'. The key stays on this device.','تم اختيار:':'Selected:',
  'إيقاف':'Stop','انتهت المهلة':'Timed out','CORS أو اتصال':'CORS or connection','ترجمة':'Translation','أدوات':'Tools',
  'تم التعرّف: <b>':'Detected: <b>','</b>. المفتاح يبقى بهالجهاز.':'</b>. The key stays on this device.','هذا المفتاح يصلح لـDeepSeek وOpenAI. اختر المزوّد.':'This key works with DeepSeek and OpenAI. Choose the provider.',
  'تم اختيار: <b>':'Selected: <b>','ما عرفت المزوّد من صيغة المفتاح. اختر المزوّد من القائمة.':'Could not detect the provider from the key format. Choose it from the list.',
  'تأخر مزوّد الذكاء':'The AI provider timed out','وما وصل رد في الوقت المتوقع. جرّب مرة ثانية.':'No reply arrived in time. Try again.',
  'انوقف.':'Stopped.','الموديل المختار ما عاد متاحًا':'The selected model is no longer available',' لدى «':' on “','». اختر موديلًا آخر.':'”. Choose another model.',
  'المزوّد رجّع ردًّا فارغًا بدون نص. جرّب مرة ثانية، أو غيّر الموديل.':'The provider returned an empty reply with no text. Try again or change the model.',
  'المزوّد ما رجّع بطاقة فصل بصيغة JSON صالحة بعد محاولتين. جرّب فصلًا آخر أو أعد المحاولة لاحقًا.':'The provider did not return a valid JSON chapter card after two attempts. Try another chapter or retry later.',
  'المحتوى أطول من نافذة النموذج حتى بعد الاختصار. قلّل الفصل أو النص المرسل أو ارفع نافذة السياق من الإعدادات.':'The content is longer than the model window even after trimming. Shorten the chapter or the sent text, or raise the context window in Settings.',
  'لا أرسل المفتاح إلى رابط غير مشفّر. استخدم https، أو localhost لتشغيل محلي.':'I will not send the key to an unencrypted URL. Use https, or localhost for a local server.',
  'ما وصل الطلب':'The request did not reach','إلى':'to','للخدمة':'the service','تعذّر استخدام':'Could not use','المفتاح غير مضبوط أو الموديل غير محدد. أضف المفتاح من «الإعدادات» أو اختر موديلًا آخر.':'The key is not set or no model is selected. Add the key from Settings or choose another model.',
  'مفتاح':'key','غير صالح أو غير مصرّح له.':' is invalid or not authorized.','المفتاح غير صالح أو غير مصرّح له.':'The key is invalid or not authorized.','تأكد من المفتاح ومن صلاحياته.':'Check the key and its permissions.',
  'رصيد المزوّد غير كافٍ. راجع رصيد الحساب أو استخدم مفتاحًا آخر.':'The provider balance is insufficient. Check the account balance or use another key.',
  'المزوّد يطلب تهدئة الطلبات (429). انتظر قليلًا ثم جرّب.':'The provider is rate limiting requests (429). Wait a moment and try again.',
  'مزوّد':'provider','ردّ':'reply','الخدمة ردّت':'The service replied','بخطأ':'with an error','— تأكد من الرابط واسم النموذج.':'— check the URL and model name.',
  'ما وصل الطلب للخدمة':'The request did not reach the service','، لأن الصفحة مفتوحة كملف محلي والمتصفح يمنع الطلب (CORS).':', because the page is open as a local file and the browser blocks the request (CORS).',
  '، غالباً بسبب CORS أو الاتصال.':', most likely because of CORS or the connection.','افتح الصفحة من سيرفر محلي أو استضافة، أو استخدم وسيط.':'Open the page from a local server or a host, or use a proxy.',
  'الموديل اللي اخترته ما عاد متاح':'The model you selected is no longer available','. اختر موديلًا آخر للمحادثة.':'. Choose another model for the chat.',
  'ما فيه موديل مثبّت للدردشة. أضف اتصالًا واختر موديلًا.':'No chat model is pinned. Add a connection and choose a model.','افتح الإعدادات':'Open settings',
  'رجعت':'fell back','بلا موديل':'with no model'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });

/* dialogs, import/export, upload and the translation tool */
Object.entries({
  'المجموع: قرابة':'Total: about','ملاحظتك:':'Your note:','ملاحظتي:':'My note:','ملاحظتي':'My note','اشرح لي اللي ما فهمته':'Explain what I did not understand',
  'ما ظلّلت شي في هالكتاب بعد. حدّد نص وأنت تقرأ واختر «مهم» أو «ما فهمت» أو «سؤال».':'No highlights in this book yet. Select text while reading and choose “Important”, “Unclear” or “Question”.',
  'تظليلاتي:':'My highlights:','تظليل':'highlights','ما لقيت شي عن «':'Nothing found for “','نتيجة':'results','نتائج':'results','صفحة':'page','صفحتنا':'pages',
  'ملاحظتك':'Your note','باقي':'left',
  'ابدأ جلسة قراءة من شريط القارئ أول':'Start a reading session from the reader bar first','لين تنتهي جلسة القراءة':'Until the reading session ends',
  'بدأت جلسة':'Started a session','انتهت جلستك':'Your session has ended','انحفظت':'Saved','دقيقة':'min',
  'ملاحظتك:':'Your note:','اضغط لترى الجواب':'Tap to see the answer','بطاقة':'Card','بطاقة، تجيك بكرة عشان ما تصير المراجعة عبء.':'cards come back tomorrow so review does not become a burden.',
  'ترجمة الكتاب':'Translate book','اضبط الذكاء من «الإعدادات» أول':'Set up AI in Settings first',
  'يحذف كل الكتب والتظليلات والمحادثات وإعدادات القراءة من هالجهاز، ولا يمكن التراجع. يبقى مفتاح الذكاء، ومواضع الخريطة، ومزيجات الأصوات إلا إذا اخترت حذفها تحت.':'Deletes all books, highlights, chats and reading settings from this device. This cannot be undone. The AI key, map positions and sound mixes stay unless you choose to delete them below.',
  'احذف أيضًا':'Also delete','مفتاح الذكاء، ومواضع/تثبيتات الخريطة، ومزيجات الأصوات، وكل إعدادات':'the AI key, map positions/pins, sound mixes, and all',
  'التخزين غير متاح. ما قدرت أحفظ الكتاب مع ملفه.':'Storage is unavailable. I could not save the book with its file.',
  'مساحة التخزين ما تكفي لهالملف. صدّر أو احذف كتبًا قديمة أول، أو جرّب ملفًا أصغر.':'There is not enough storage for this file. Export or delete old books first, or try a smaller file.',
  'ما انحفظ: مساحة التخزين امتلأت أثناء الحفظ. الكتاب وملفه ما انحفظوا معًا.':'Not saved: storage filled up during the save. The book and its file were not saved together.',
  'ما انحفظ الكتاب على هالجهاز.':'The book was not saved on this device.','لمكتبتك.':' to your library.',
  'تعذّرت قراءة هذه الصفحة.':'Could not read this page.','نص الكتاب مقروء آليًا من صور الصفحات على جهازك، وقد يحتوي أخطاء خصوصًا في التشكيل.':'The book text was read automatically from page images on your device and may contain errors, especially in diacritics.','النص مقروء آليًا من صور الصفحات وقد يحتوي أخطاء، خصوصًا في التشكيل. التعرّف: Tesseract على جهازك.':'The text was read automatically from page images and may contain errors, especially in diacritics. Recognition: Tesseract on your device.','ملف الـPDF الأصلي للكتب الممسوحة ما ينضم للتصدير، بس نصها المقروء آليًا ينضم.':'The original PDF of scanned books is not included in exports; only the recognized text is.','أقل من دقيقة':'less than a minute',
  'الملف غير صالح.':'The file is invalid.','ما قدرت أقرأ الملف':'Could not read the file','ما تغيّر شي: ما قدرنا نحفظ الاستيراد.':'Nothing changed: the import could not be saved.',
  'استوردت':'Imported','عنصر':'items','· تخطيت':' · skipped','مكرر':'duplicate','هذا العنصر موجود في مكتبتك، فتخطيته.':'This item is already in your library, so it was skipped.',
  'ما تغيّر شي: ما قدرنا نحفظ العنصر.':'Nothing changed: the item could not be saved.','انضاف':'Added',
  'ما تغيّر شي':'Nothing changed','الملف فيه بيانات غير صالحة، فما انحفظ أي شي.':'The file contains invalid data, so nothing was saved.','وفيه':'It also has','خطأ آخر.':'more errors.','حسنًا':'OK',
  'ملف كبير على جهاز بذاكرة محدودة':'Large file on a device with limited memory','هالملف حجمه':'This file is','ميجابايت، وجهازك يبلّغ بذاكرة':'MB, and your device reports','جيجابايت. التحويل قد يبطئ التاب أو يستهلك مساحة كبيرة.':'GB. Converting may slow the tab or use a lot of space.','كمّل على مسؤوليتي':'Continue at my own risk',
  'النص الملصوق كبير جدًا. اختصره أو ارفعه كملف.':'The pasted text is too large. Shorten it or upload it as a file.','الصق نص أول.':'Paste some text first.',
  'كتاب ممسوح ضوئيًا':'Scanned book','طريقة قراءة النص':'Text recognition method','محلي مجاني (أسرع)':'Local, free (faster)','بالذكاء (أعلى جودة، بمفتاحك)':'With AI (higher quality, your key)',
  'احفظ واقرأ النص الآن':'Save and read the text now','احفظ فقط':'Save only','قراءة النص محليًا ما تتوفر في نسخة الملف الواحد.':'Local text recognition is not available in the single-file build.',
  'ما فيه اتصال ذكاء مهيأ. اضبطه في الإعدادات أول، أو اختر «محلي مجاني».':'No AI connection is set up. Configure it in Settings first, or choose “Local, free”.',
  'أقل من سنت':'Less than a cent','قرابة $':'About $','ستُرسل صور صفحات الكتاب إلى':'The book page images will be sent to','لتحويلها إلى نص فقط؛ لا تُخزَّن لدينا. التكلفة التقديرية':'only to convert them to text; they are not stored by us. Estimated cost','لكامل الكتاب.':'for the whole book.',
  'ما فيه اتصال ذكاء مهيأ للقراءة بالصور. اضبطه في الإعدادات أول أو اختر «محلي مجاني».':'No AI connection is set up for image reading. Configure it in Settings first or choose “Local, free”.',
  'قراءة نص الكتب الممسوحة تتم على جهازك بالكامل (Tesseract). ملفات التعرف تنزّل مرة واحدة من موقع التطبيق فقط، وصفحات كتبك ما تنرسل لأي جهة.':'Text recognition for scanned books runs entirely on your device (Tesseract). The recognition files download once from the app’s own site only, and your book pages are never sent anywhere.',
  'تحويل الملف':'Converting the file','أجهّز محوّل الملفات…':'Preparing the converter…','أقرأ الصفحات…':'Reading pages…','أرتّب الفصول والحواشي…':'Arranging chapters and notes…',
  'تحويل PDF':'PDF conversion','جاري التجهيز…':'Preparing…','المزيد':'More'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });

/* translation feature */
Object.entries({
  'اقرأ بالعربية':'Read in Arabic','اقرأ الكتاب بالعربية':'Read the book in Arabic','استكمل الترجمة':'Resume translation','ابدأ الترجمة':'Start translation','أعد الترجمة':'Retranslate',
  'ابدأ من جديد':'Start over','استكمل':'Resume','استكمال':'Resume','الأصل':'Original','ارجع إلى النص الأصلي':'Back to the original text','ترجمة هذا الفصل إلى العربية':'Translate this chapter into Arabic',
  'مترجم':'Translated','مترجم — سيُتخطى':'Translated — skipped','جزئي':'Partial','فارغ':'Empty','لم يُترجم':'Not translated','مكتمل':'Complete','تحذير':'Warning','خطأ':'Error',
  'الترجمة جاهزة':'Translation ready','ترجمة الكتاب جاهزة':'Book translation ready','توقفت الترجمة':'Translation stopped','توقفت ترجمة الكتاب':'Book translation stopped',
  'اكتملت الترجمة':'Translation complete','اكتملت ترجمة الكتاب.':'The book translation is complete.','اكتملت مع ملاحظات':'Completed with notes','الملخص':'Summary','متوقفة ·':'Paused ·',
  'تأكيد التكلفة':'Confirm cost','تأكيد البدء':'Confirm and start','رجوع':'Back','كل الفصول':'All chapters','من الفصل الحالي':'From the current chapter','إلى النهاية':'to the end',
  'التوازي':'Parallel requests','1 — متسلسل':'1 — sequential','3 — أسرع':'3 — fastest',
  'قاموس المصطلحات (اختياري)':'Glossary (optional)','سطر لكل مصطلح: English = عربي. يُرسل فقط ما يظهر في المقطع.':'One term per line: English = Arabic. Only terms that appear in the chunk are sent.',
  'أترجم نسخة أملكها للاستخدام الشخصي فقط، ولن أنشر الترجمة. نص هذا الفصل سيُرسل إلى مزود الذكاء الذي اخترته.':'I am translating a copy I own for personal use only, and I will not publish the translation. This chapter’s text will be sent to the AI provider you selected.',
  'أترجم نسخة أملكها للاستخدام الشخصي فقط، ولن أنشر الترجمة. نص الكتاب سيُرسل إلى مزود الذكاء الذي اخترته.':'I am translating a copy I own for personal use only, and I will not publish the translation. The book’s text will be sent to the AI provider you selected.',
  'PDF: الكتل التي طولها 3 كلمات أو أقل تبقى بالأصل ولا تُرسل.':'PDF: blocks of 3 words or fewer stay in the original and are not sent.',
  'جودة تحويل هذا الملف تحتاج مراجعة.':'The conversion quality of this file needs review.','راجع النص الأصلي قبل الاعتماد على الترجمة.':'Review the original text before relying on the translation.',
  'الترجمة المحفوظة لهذا الفصل أُعدت بإعدادات أو قاموس مختلف.':'The saved translation for this chapter was made with different settings or glossary.','لا يمكن الاستئناف فوقها؛ ابدأ من جديد.':'It cannot be resumed; start over.',
  'آخر تقدّم:':'Last progress:','مقطعًا.':'chunks.','مقطعًا':'chunks','ترجمة هذا الفصل':'Translate this chapter','إعدادات الترجمة':'Translation settings',
  'ترجمة آلية':'Machine translation','بقيت':'Remained','فقرة بالأصل. راجعها قبل الاعتماد.':'paragraphs in the original. Review them before relying on the translation.','راجع النص الأصلي عند الشك.':'Check the original text when in doubt.',
  'ترجمة هذا الفصل':'Translate this chapter','أترجم هذا الفصل':'Translating this chapter','أجهّز المقاطع…':'Preparing chunks…','أترجم المقطع':'Translating chunk',
  'الترجمة جاهزة':'Translation ready','اكتملت مع أخطاء في':'Completed with errors in','مقطعًا. راجع التحذيرات قبل الاعتماد.':'chunks. Review the warnings before relying on it.',
  'اكتملت مع':'Completed with','مقطعًا يحتاج مراجعة.':'chunks that need review.','اكتملت الترجمة.':'Translation complete.',
  'مقطعًا محفوظة. تقدر تستكمل من آخر مقطع.':'chunks saved. You can resume from the last chunk.','مقطعًا محفوظة. التبويب يلزم يبقى مفتوحًا أثناء الترجمة.':'chunks saved. The tab must stay open while translating.',
  'تغيّرت إعدادات الذكاء؛ افتح الترجمة من جديد.':'The AI settings changed; open translation again.','ما فيه ترجمة محفوظة لهذا الفصل':'No saved translation for this chapter',
  'أترجم الكتاب':'Translating the book','الفصل الحالي:':'Current chapter:','الفصل الحالي':'Current chapter',
  'فصول تحتاج مراجعة':'Chapters that need review','التبويب لازم يبقى مفتوحًا أثناء الترجمة. الترجمة محفوظة على هذا الجهاز فقط.':'The tab must stay open while translating. The translation is saved on this device only.',
  'كل الفصول المحددة مترجمة بالفعل.':'All selected chapters are already translated.','الوقت التقديري:':'Estimated time:','· تقدير تقريبي يعتمد على سرعة المزوّد.':'· a rough estimate that depends on provider speed.',
  'التقدير أعلى من 1.00$.':'The estimate is over $1.00.','هذا تقدير وليس فاتورة، وقد يزيد حسب طول الترجمة والتكرارات.':'This is an estimate, not a bill; it may increase with translation length and retries.',
  'التبويب لازم يبقى مفتوحًا.':'The tab must stay open.','الترجمة تتوقف إذا أغلقت التبويب، وتستأنف من أول مقطع غير مكتمل عند فتحه من جديد.':'Translation stops if you close the tab and resumes from the first incomplete chunk when you reopen it.',
  'نطاق الترجمة':'Translation range','اقرأ الكتاب بالعربية':'Read the book in Arabic','استكمل ترجمة الكتاب':'Resume book translation','ابدأ ترجمة الكتاب':'Start book translation',
  'أترجم نسخة أملكها للاستخدام الشخصي فقط.':'I am translating a copy I own for personal use only.'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });

/* remaining reader, annotation, session, import and translation copy */
Object.entries({
  '↑ ارجع للبداية':'↑ Back to top','ما قدرت أنسخ':'Could not copy','بدون عنوان':'Untitled','هالأسبوع':'This week','أقدم':'Older','محادثة':'Chat','خيارات الكتاب':'Book options',
  'أضف مصطلح':'Add term','بالإنجليزي (اختياري)':'English (optional)','تعريف بسطر':'One-line definition','احفظ في قاموسي':'Save to my glossary',
  'ملاحظة على التظليل':'Note on highlight','ابحث في تظليلاتك ومصطلحاتك':'Search your highlights and terms','ما فيه أفكار ثانية بعد. ظلّل من مصدر ثاني وارجع.':'No more ideas yet. Highlight from another source and come back.',
  'مصطلح · في':'Term · in','مصادر':'sources','ملخّصي':'Summary','المصطلحات من النص الأصلي فقط حاليًا.':'Terms from the original text only for now.',
  'ظلّلتها «مهم»، وبترجع لك في المراجعة':'Highlighted “Important” — it will come back in review','ظلّلتها':'Highlighted',
  'ما انحفظت مواضع الخريطة على هالجهاز.':'Map positions were not saved on this device.','ما انحفظت إعدادات الأصوات على هالجهاز.':'Sound settings were not saved on this device.',
  'ما انحفظت إعدادات الاتصال على هالجهاز.':'Connection settings were not saved on this device.','ما انحفظت الإعدادات على هالجهاز.':'Settings were not saved on this device.',
  'تم تحديث قاعدة البيانات من تبويب آخر. أعد تحميل الصفحة قبل ما تكمل.':'The database was updated in another tab. Reload the page before continuing.',
  'تم تعديل المكتبة من تبويب آخر. أعد تحميل الصفحة لتشاهد آخر نسخة.':'The library was changed in another tab. Reload the page to see the latest version.',
  'التخزين غير متاح في هذا المتصفح. التغييرات ما راح تنحفظ بعد إغلاق الصفحة.':'Storage is unavailable in this browser. Changes will not be saved after you close the page.',
  'ما قدرنا نحذف الكتاب من التخزين':'Could not delete the book from storage',
  'ما فيه نص كافٍ لترجمة هذا الفصل.':'Not enough text to translate this chapter.','النموذج:':'Model:','· الترجمة آلية وتحتاج مراجعة.':'· machine translation; review it before relying on it.',
  'يتوقف…':'Stopping…','المزوّد يطلب تهدئة الطلبات (429). توقفت الترجمة مؤقتًا.':'The provider is rate limiting requests (429). Translation paused.','توقفت الترجمة. تقدر تستكمل من آخر مقطع محفوظ.':'Translation stopped. You can resume from the last saved chunk.',
  'تظليل في النص الأصلي':'highlight in the original text','افتح التظليل الأصلي':'Open the original highlight',
  'المزوّد يطلب تهدئة الطلبات (429). توقفت ترجمة الكتاب مؤقتًا.':'The provider is rate limiting requests (429). Book translation paused.','توقفت ترجمة الكتاب. تقدر تستكمل من أول مقطع غير مكتمل.':'Book translation stopped. You can resume from the first incomplete chunk.',
  'توقفت الترجمة بسبب خطأ في أحد المقاطع. المقاطع المحفوظة باقية، وتقدر تستكمل.':'Translation stopped because of an error in one chunk. Saved chunks are kept, and you can resume.',
  'اكتملت مع أخطاء في بعض المقاطع. راجع القائمة.':'Completed with errors in some chunks. Review the list.',
  'بكتب «بطاقة فصل» صغيرة لكل فصل: أفكاره ومصطلحاته ومواضيعه. تنكتب مرة وحدة، وبها يعرف الرفيق كتبك بدون ما يقرأها كاملة مع كل سؤال.':'The assistant writes a small “chapter card” for each chapter: its ideas, terms and topics. It is written once, so the companion knows your books without reading them in full on every question.',
  'جهزت':'Prepared','فصل.':'chapters.','بعضها ما رجع بالشكل المطلوب، جرّب مرة ثانية.':'Some did not come back in the expected shape. Try again.',
  'انضاف للجلسة الحالية فقط؛ التخزين غير متاح.':'Added to this session only; storage is unavailable.',
  'وفيه':'It also has','خطأ آخر.':'more errors.'
}).forEach(([k, v]) => { if (!(k in EN_UI)) EN_UI[k] = v; });

EN_PAT.push(
  [/^نهاية الفصل (\d+)$/, 'End of chapter $1'],
  [/^المجموع: قرابة (\d+) دقيقة قراءة\.$/, 'Total: about $1 min read.'],
  [/^الفصل (\d+) · باقي (\d+) دقيقة$/, 'Chapter $1 · $2 min left'],
  [/^بدأت جلسة (\d+) دقيقة$/, 'Started a $1 min session'],
  [/^انتهت جلستك \((\d+) دقيقة\)$/, 'Your session has ended ($1 min)'],
  [/^جلسة قراءة، باقي (\d+) دقيقة$/, 'Reading session, $1 min left'],
  [/^· (\d+) تظليل$/, '· $1 highlights'],
  [/^(.+) · (\d+) تظليل$/, '$1 · $2 highlights'],
  [/^تحذف «(.+)» مع تظليلاته وملاحظاته؟$/, 'Delete “$1” with its highlights and notes?'],
  [/^التكلفة التقريبية \(تقدير\): 1 فصل(?: في 1 كتب)? = 1 طلب، قرابة (\d+) ألف توكن، تشمل تعليمات النظام ونص الفصل والرد\.$/, 'Estimated cost: 1 chapter = 1 request, about $1k tokens, including system instructions, chapter text and the reply.'],
  [/^التكلفة التقريبية \(تقدير\): (\d+) فصل(?: في (\d+) كتب)? = (\d+) طلب، قرابة (\d+) ألف توكن، تشمل تعليمات النظام ونص الفصل والرد\.$/, 'Estimated cost: $1 chapters = $3 requests, about $4k tokens, including system instructions, chapter text and the reply.'],
  [/^باقي (\d+) بطاقة، تجيك بكرة عشان ما تصير المراجعة عبء\.$/, '$1 cards left; they come back tomorrow so review stays light.'],
  [/^باقي (\d+) بطاقة، تجيك بكرة عشان ما تصير المراجعة عبء\.$/, '$1 cards left; they come back tomorrow so review stays light.'],
  [/^أضفت «(.+)» بموديل (.+)\.$/, 'Added “$1” with model $2.'],
  [/^تم التعرّف: <b>(.+)<\/b>\. المفتاح يبقى بهالجهاز\.$/, 'Detected: <b>$1</b>. The key stays on this device.'],
  [/^تم اختيار: <b>(.+)<\/b>\.$/, 'Selected: <b>$1</b>.'],
  [/^أجرّب «(.+)»…$/, 'Testing “$1”…'],
  [/^انحفظت موديلات «(.+)»\.$/, 'Saved models for “$1”.'],
  [/^تعذّر جلب \/models \((.+)\)\. $/, 'Could not fetch /models ($1). '],
  [/^الصق مفتاح (.+) أول\.$/, 'Paste a $1 key first.'],
  [/^ملف كبير على جهاز بذاكرة محدودة$/, 'Large file on a device with limited memory'],
  [/^(\d+) من (\d+) صفحة$/, '$1 of $2 pages'],
  [/^(\d+) صفحة$/, '$1 pages'],
  [/^من الفصل الحالي \((\d+)\) إلى النهاية$/, 'From current chapter ($1) to the end'],
  [/^بطاقة (\d+) من (\d+)$/, 'Card $1 of $2'],
  [/^(\d+) من (\d+) مقطعًا$/, '$1 of $2 chunks'],
  [/^(\d+) مقطعًا$/, '$1 chunks'],
  [/^(\d+) تظليل$/, '$1 highlights'],
  [/^الفصل (\d+) الحالي$/, 'Chapter $1'],
  [/^أعد قراءة الصفحة الفاشلة$/, 'Retry the failed page'],
  [/^أعد قراءة الصفحات الفاشلة \((\d+)\)$/, 'Retry failed pages ($1)']
);

export const AR_RE = /[\u0600-\u06FF]/;
/* Book/user content is marked with data-no-tr (or one of the legacy classes) and
   never rewritten. The reader used to be skipped wholesale, which also skipped
   its chrome; now only authored text is excluded. */
export const TR_SKIP = '[data-no-tr], .rtp-p, [dir="auto"], .cv, .bcv, .cm-a, .cm-u, .hlq, .gl-ar, .gl-def, .sh-quote, .rv-q, .rv-a, .rv-src, .rt-rh, .rt-cw, .rt-fz, .rt-gl, .rd-prev, .bp-h, .bp-sub, .bp-au, .bp-why p, .bp-ch .t, .bp-cv, #pageTitle, #tbTitle, textarea, pre, code, bdi';
function patTr(k){ for (const [re, rp] of EN_PAT) if (re.test(k)) return k.replace(re, rp); return null; }

export function translateText(k){
  if (EN_UI[k]) return EN_UI[k];
  const p = patTr(k); if (p != null) return p;
  if (k.includes('·')){ const out = k.split(/(\s*·\s*)/).map(x => !x.trim() || x.includes('·') || !AR_RE.test(x) ? x : (EN_UI[x.trim()] || patTr(x.trim()))); if (out.every(x => x != null)) return out.join(''); }
  return null;
}


export function hasArabic(s){
  return AR_RE.test(String(s == null ? '' : s));
}
