import { AR } from './i18n-ar.js'

/**
 * No browser code here: the server uses this module too, to write documents in Arabic.
 * Arabic for the messages the server writes: errors, brief checks, cancellation and card reasons, placement warnings,
 * timeline and ledger notes, and the lines and notes on receipts and invoices. The server always answers in English;
 * the screens translate here, so one dictionary (checked by i18n.test.ts) covers the whole product.
 * In a key, {} stands for a value the server fills in; the Arabic says where each one goes as {1}, {2}…
 */
export const SERVER_AR: Record<string, string> = {
  "Email is not set up yet: add the SMTP details to the server settings first.": "البريد غير مُعد بعد: أضف بيانات SMTP إلى إعدادات الخادم أولًا.",
  "The email server refused: {}": "رفض خادم البريد: {1}",
  "Your company needs at least one active team manager. Make someone else a manager first.": "تحتاج شركتك إلى مدير فريق نشط واحد على الأقل. اجعل شخصًا آخر مديرًا أولًا.",
  "Invite colleagues with a work email at {}. For anyone else, ask Nashr.": "ادعُ الزملاء ببريد عمل على {1}. ولأي شخص آخر، تواصل مع نشر.",
  "You cannot remove yourself. Ask another team manager.": "لا يمكنك إزالة نفسك. اطلب ذلك من مدير فريق آخر.",
  "This person is not removed.": "هذا الشخص غير مُزال.",
  "This person never joined. Send them a new invite instead.": "لم ينضم هذا الشخص قط. أرسل له دعوة جديدة بدلًا من ذلك.",
  "Accept the updated terms of use to carry on.": "وافق على شروط الاستخدام المحدّثة للمتابعة.",
  "Too many failed sign-ins for this account. Try again in 15 minutes, or reset your password.": "محاولات دخول فاشلة كثيرة لهذا الحساب. حاول بعد 15 دقيقة، أو أعد تعيين كلمة المرور.",
  "Only the founder can sign a staff member out.": "المؤسس وحده يمكنه تسجيل خروج أحد أفراد الفريق.",
  "Write why this person is being signed out.": "اكتب سبب تسجيل خروج هذا الشخص.",
  "Write just the name.": "اكتب الاسم فقط.",
  "Someone already uses this email on Nashr.": "هناك من يستخدم هذا البريد على نشر بالفعل.",
  "This person has already joined.": "انضم هذا الشخص بالفعل.",
  "Only the founder can invite staff.": "المؤسس وحده يمكنه دعوة أفراد الفريق.",
  "Accept the terms of use to join.": "وافق على شروط الاستخدام للانضمام.",
  "The terms changed while you were reading. Read the latest version and accept again.": "تغيّرت الشروط أثناء قراءتك. اقرأ أحدث إصدار ووافق مجددًا.",
  "The email or the code is not right.": "البريد الإلكتروني أو الرمز غير صحيح.",
  "Statements can be added only while Nashr is deciding a dispute.": "لا يمكن إضافة إفادات إلا أثناء نظر نشر في النزاع.",
  "Explain your side in a few sentences.": "اشرح روايتك في بضع جمل.",
  "Emails and phone numbers are not allowed here.": "لا يُسمح هنا بالبريد الإلكتروني وأرقام الهاتف.",
  "Each side can add up to five statements. Nashr has your case.": "يمكن لكل طرف إضافة خمس إفادات كحد أقصى. ملفك لدى نشر.",
  "Emails and phone numbers are not allowed in the address.": "لا يُسمح بالبريد الإلكتروني وأرقام الهاتف في العنوان.",
  "Too many live connections.": "عدد كبير جدًا من الاتصالات المباشرة.",
  "This person has not asked for a password reset. They ask from \"Forgot your password?\" on the sign-in page.": "لم يطلب هذا الشخص إعادة تعيين كلمة المرور. يطلبها من «نسيت كلمة المرور؟» في صفحة تسجيل الدخول.",
  "The buyer's bank is deciding a chargeback on this payment. Wait for its decision.": "يبتّ بنك المشتري في استرداد على هذه الدفعة. انتظر قراره.",
  "The buyer's bank decided the chargeback for the buyer": "حسم بنك المشتري الاسترداد لصالح المشتري",
  "chargeback fee": "رسوم الاسترداد البنكي",
  "chargeback won": "كسب الاسترداد البنكي",
  "chargeback lost: payout withheld": "خسارة الاسترداد البنكي: حُجبت الدفعة",
  "Two-step sign-in is already on.": "تسجيل الدخول بخطوتين مفعّل بالفعل.",
  "Two-step sign-in is already off.": "تسجيل الدخول بخطوتين متوقف بالفعل.",
  "Write why two-step sign-in is being turned off.": "اكتب سبب إيقاف تسجيل الدخول بخطوتين.",
  "Two-step sign-in is not on for this user.": "تسجيل الدخول بخطوتين غير مفعّل لهذا المستخدم.",
  "Turn on two-step sign-in under Your account before paying.": "فعّل تسجيل الدخول بخطوتين من صفحة حسابك قبل الدفع.",
  "Turn on two-step sign-in under Your account before connecting your payout account.": "فعّل تسجيل الدخول بخطوتين من صفحة حسابك قبل ربط حساب التحويلات.",
  "Tell us a little more, so we can help the first time.": "أخبرنا بالمزيد قليلًا، لنساعدك من المرة الأولى.",
  "You have 10 open requests. Nashr will answer those first.": "لديك 10 طلبات مفتوحة. ستجيب نشر عنها أولًا.",
  "Write the answer.": "اكتب الإجابة.",
  "Nashr is signed in as this user. The person must do this step themselves.": "نشر مسجّلة الدخول باسم هذا المستخدم. يجب أن يقوم الشخص بهذه الخطوة بنفسه.",
  "Write why you are signing in as this user.": "اكتب سبب تسجيل الدخول باسم هذا المستخدم.",
  "You can sign in only as an active buyer or publisher user.": "يمكنك الدخول فقط باسم مستخدم مشترٍ أو ناشر نشط.",
  "You are not signed in as another user.": "أنت لست مسجّل الدخول باسم مستخدم آخر.",
  // Account self-service and Nashr stepping in
  "You are viewing another account. Changes are not allowed.": "أنت تعرض حسابًا آخر. التغييرات غير مسموحة.",
  "A reset link can be issued only for an active buyer or publisher user.": "لا يمكن إصدار رابط إعادة التعيين إلا لمستخدم مشترٍ أو ناشر نشط.",
  "This reset link has expired. Ask Nashr for a new one.": "انتهت صلاحية رابط إعادة التعيين هذا. اطلب رابطًا جديدًا من نشر.",
  "Your current password is not right.": "كلمة المرور الحالية غير صحيحة.",
  "Choose a new password, not the current one.": "اختر كلمة مرور جديدة، لا الحالية.",
  "Write the reason the buyer will see.": "اكتب السبب الذي سيراه المشتري.",
  "Only a live bid on an open auction can be voided.": "لا يمكن إلغاء إلا عرض قائم في مزاد مفتوح.",
  "Write the reason both sides will see.": "اكتب السبب الذي سيراه الطرفان.",
  "This step is not possible for a deal in this state.": "هذه الخطوة غير ممكنة لصفقة في هذه الحالة.",
  "The buyer's bank disputed the payment": "اعترض بنك المشتري على الدفعة",
  // Requests and access
  'Send JSON.': 'أرسل البيانات بصيغة JSON.', 'Please sign in.': 'يرجى تسجيل الدخول.', 'The file is too large.': 'الملف كبير جدًا.', 'Requests must come from Nashr.': 'يجب أن تصدر الطلبات من نشر.',
  'Some fields are missing or not valid.': 'بعض الحقول ناقصة أو غير صحيحة.', 'Something went wrong on our side.': 'حدث خطأ من جهتنا.', 'Something went wrong.': 'حدث خطأ ما.', 'Upload failed.': 'تعذّر الرفع.',
  'View only: you are viewing this account as an admin.': 'للعرض فقط: أنت تعرض هذا الحساب بصفة مشرف.', 'You do not have access to this.': 'لا تملك صلاحية الوصول إلى هذا.', 'Not found.': 'غير موجود.',
  'Not signed in.': 'لم تسجّل الدخول.', 'Too many requests. Try again in a minute.': 'طلبات كثيرة جدًا. حاول بعد دقيقة.', 'Too many attempts. Try again in a minute.': 'محاولات كثيرة جدًا. حاول بعد دقيقة.',
  'Signature check failed.': 'فشل التحقق من التوقيع.', 'Enter a valid work email.': 'أدخل بريدًا إلكترونيًا صحيحًا للعمل.',
  'Please use your business email. Free email addresses are not accepted.': 'يرجى استخدام بريد العمل. لا تُقبل عناوين البريد المجانية.',
  'This request has already been decided.': 'سبق البتّ في هذا الطلب.', 'A reason is required to reject.': 'يلزم ذكر سبب للرفض.', 'Say what information you need.': 'اذكر المعلومات التي تحتاجها.',
  'This invite link has expired. Ask Nashr for a new one.': 'انتهت صلاحية رابط الدعوة. اطلب رابطًا جديدًا من نشر.', 'Use a password of at least 12 characters.': 'استخدم كلمة مرور من 12 حرفًا على الأقل.',
  'The code from your authenticator app is not right.': 'الرمز من تطبيق المصادقة غير صحيح.', 'Email or password is not right.': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'Enter the code from your authenticator app.': 'أدخل الرمز من تطبيق المصادقة.',
  // Marketplace
  'This market is coming soon. Join the waiting list to hear when it opens.': 'هذا السوق قادم قريبًا. انضم إلى قائمة الانتظار لتعرف موعد افتتاحه.', 'Choose one of your active campaigns.': 'اختر إحدى حملاتك النشطة.',
  'Bidding is closed for this slot.': 'أُغلقت المزايدة على هذه المساحة.', 'You are already the top bidder at this amount.': 'أنت بالفعل صاحب أعلى مزايدة بهذا المبلغ.', 'Your bid must be at least {}.': 'يجب ألا تقل مزايدتك عن {1}.',
  'Buy now is not available for this slot.': 'الشراء الفوري غير متاح لهذه المساحة.', 'You already have a buy-now request on this slot.': 'لديك بالفعل طلب شراء فوري على هذه المساحة.',
  'This person has already set their password, or the request was not approved.': 'أكمل هذا الشخص تعيين كلمة المرور، أو لم تتم الموافقة على الطلب.',
  "Emails and phone numbers are not allowed in what buyers see.": "لا يُسمح بالبريد الإلكتروني وأرقام الهاتف فيما يراه المشترون.",
  "The buy-now price must be above the starting price.": "يجب أن يكون سعر الشراء الفوري أعلى من سعر البداية.",
  "A week-long placement starts on one day and has no breaks.": "المساحة الأسبوعية تبدأ في يوم واحد ولا تحتوي على فواصل.",
  "This slot is no longer available.": "لم تعد هذه المساحة متاحة.",
  "This request has expired.": "انتهت صلاحية هذا الطلب.",
  "It is too close to the creative deadline for another buyer to pay. The slot will be relisted.": "اقترب موعد تسليم المادة كثيرًا ولا يتسع الوقت لدفع مشترٍ آخر. ستُعاد المساحة للعرض.",
  "Choose a valid date range.": "اختر نطاق تواريخ صحيحًا.",
  "An overlapping booking was accepted": "قُبل حجز متداخل مع هذه المساحة",
  "Buy-now and reserve prices are for auctions only.": "سعر الشراء الفوري والسعر الأدنى للمزادات فقط.",
  "This slot is not sold at a fixed price.": "هذه المساحة لا تُباع بسعر ثابت.",
  "Someone has just booked this slot, or it is no longer on sale.": "حجز أحدهم هذه المساحة للتو، أو لم تعد معروضة للبيع.",
  "This outlet does not accept {} advertising.": "لا تقبل هذه المنصة إعلانات {1}.",
  "This outlet does not run ads for this advertiser.": "لا تنشر هذه المنصة إعلانات لهذا المعلن.",
  'This slot is not a quick sale.': 'هذه المساحة ليست للبيع السريع.', 'Offers cannot be below {}.': 'لا يمكن أن تقل العروض عن {1}.', 'This interest can no longer be accepted.': 'لم يعد ممكنًا قبول هذا الاهتمام.',
  'A reason is required to decline.': 'يلزم ذكر سبب للرفض.', 'This bid cannot be chosen.': 'لا يمكن اختيار هذه المزايدة.',
  'You can save up to {} searches. Delete one to save another.': 'يمكنك حفظ {1} عمليات بحث كحد أقصى. احذف واحدة لتحفظ أخرى.',
  // Booking brief
  'A booking brief is required with your first bid.': 'يلزم ملخص حجز مع أول مزايدة لك.', 'Add the advertiser or brand.': 'أضف المعلن أو العلامة التجارية.', 'Choose the industry.': 'اختر القطاع.',
  'Say what the ad will say.': 'اذكر مضمون الإعلان.', 'What the ad will say must be 280 characters or fewer.': 'يجب ألا يتجاوز مضمون الإعلان 280 حرفًا.', 'Choose the creative language.': 'اختر لغة المادة الإعلانية.',
  'A landing page link is required for digital placements.': 'يلزم رابط صفحة هبوط للمساحات الرقمية.', 'The landing page link must start with https://.': 'يجب أن يبدأ رابط صفحة الهبوط بـ https://.',
  'Upload a draft of the creative or tick "creative to follow".': 'ارفع مسودة المادة الإعلانية أو اختر "المادة الإعلانية لاحقًا".',
  'Remove the email or phone number from {}. Talk to the publisher through Nashr messages.': 'احذف البريد الإلكتروني أو رقم الهاتف من {1}. تواصل مع الناشر عبر رسائل نشر.',
  'the notes': 'الملاحظات', 'advertiser': 'المعلن', 'message': 'مضمون الإعلان',
  // Publisher: placements, slots, profile
  'Bidding must close at least {} days before air so there is time to accept, pay and deliver the creative.': 'يجب أن تُغلق المزايدة قبل البث بـ{1} أيام على الأقل ليتسع الوقت للقبول والدفع وتسليم المادة الإعلانية.',
  'The end time must be after the start time.': 'يجب أن يكون وقت النهاية بعد وقت البداية.', 'Slots can go live once your payout account is verified.': 'تُعرض المساحات بعد التحقق من حساب استلام المدفوعات.',
  'This overlaps {} on {} of the same days.': 'تتداخل مع {1} في {2} من الأيام نفسها.',
  'Only open slots with no bids can be taken off sale.': 'لا يمكن إيقاف بيع إلا المساحات المعروضة التي لا مزايدات عليها.', 'This slot cannot be put back on sale.': 'لا يمكن إعادة عرض هذه المساحة للبيع.',
  'Upload the invoice file first.': 'ارفع ملف الفاتورة أولًا.', 'Emails and phone numbers are not allowed in the profile.': 'لا يُسمح بعناوين البريد الإلكتروني أو أرقام الهواتف في الملف.',
  'A VAT-registered publisher needs its TRN on invoices.': 'الناشر المسجل في الضريبة يحتاج إلى رقمه الضريبي على الفواتير.',
  'Payout onboarding opens with the payment provider. It is not connected yet.': 'يبدأ إعداد استلام المدفوعات لدى مزوّد الدفع، وهو غير مربوط بعد.',
  'The publisher has not set up a payout account.': 'لم يُعدّ الناشر حساب استلام المدفوعات.', 'Nashr issues this invoice for you.': 'تصدر نشر هذه الفاتورة نيابة عنك.',
  // Files, photos, ratings, plans
  'Choose a file to upload.': 'اختر ملفًا لرفعه.', 'Upload the file first.': 'ارفع الملف أولًا.', 'Attach only files your own company uploaded.': 'أرفق فقط ملفات رفعتها شركتك.',
  'Choose a photo to upload.': 'اختر صورة لرفعها.', 'The photo is too large. Use one under 3 MB.': 'الصورة كبيرة جدًا. استخدم صورة أصغر من 3 ميغابايت.', 'Use a JPEG or PNG photo.': 'استخدم صورة JPEG أو PNG.',
  'Only outlets not on Nashr can be changed here.': 'لا يمكن هنا تغيير إلا المنصات غير المنضمة إلى نشر.',
  'You can rate the publisher after the booking is complete and the payment is released.': 'يمكنك تقييم الناشر بعد اكتمال الحجز وتحرير الدفعة.',
  'Emails and phone numbers are not allowed in a rating.': 'لا يُسمح بعناوين البريد الإلكتروني أو أرقام الهواتف في التقييم.',
  'Emails and phone numbers are not allowed. Talk through Nashr.': 'لا يُسمح بعناوين البريد الإلكتروني أو أرقام الهواتف. تواصلوا عبر نشر.',
  // Creative, proof, issues
  'This booking is not yours.': 'هذا الحجز ليس لك.', 'Creative can be sent once the publisher has accepted.': 'يمكن إرسال المادة الإعلانية بعد موافقة الناشر.',
  'The material deadline has passed.': 'انقضى موعد تسليم المادة.', 'The creative is already approved.': 'المادة الإعلانية معتمدة بالفعل.', 'The publisher is still reviewing your last file.': 'ما زال الناشر يراجع ملفك الأخير.',
  'There is no creative waiting for review.': 'لا توجد مادة إعلانية بانتظار المراجعة.',
  'Both change rounds are used. Approve the creative or reject it with a reason.': 'استُنفدت جولتا التعديل. اعتمد المادة الإعلانية أو ارفضها مع ذكر السبب.',
  'Say what needs to change.': 'اذكر ما يجب تعديله.', 'Choose a rejection reason.': 'اختر سبب الرفض.', 'Add {} before sending proof.': 'أضف {1} قبل إرسال الإثبات.',
  'Proof can be sent once the ad has run.': 'يمكن إرسال الإثبات بعد بث الإعلان.', 'The pre-run check is not open yet.': 'لم يُفتح فحص ما قبل البث بعد.', 'Choose what went wrong.': 'اختر ما الذي حدث.',
  'Add a short note.': 'أضف ملاحظة قصيرة.', 'Choose a future date for the rerun.': 'اختر تاريخًا قادمًا لإعادة البث.', 'The publisher has not answered yet.': 'لم يردّ الناشر بعد.',
  'the tearsheet': 'صفحة النشر', 'dated screenshots': 'لقطات شاشة مؤرخة', 'the live link': 'الرابط المباشر', 'the start time': 'وقت البداية', 'the end time': 'وقت النهاية', 'the as-run log': 'سجل البث',
  'the audio clip': 'المقطع الصوتي', 'the video clip': 'مقطع الفيديو', 'the episode link': 'رابط الحلقة', 'the time of the ad in the episode': 'وقت الإعلان في الحلقة',
  // Payments and cancellations
  'This booking is not waiting for payment.': 'هذا الحجز لا ينتظر الدفع.', 'Your bank is still waiting for you to confirm the last payment.': 'ما زال بنكك ينتظر تأكيدك للدفعة الأخيرة.',
  'Enter a partial refund between zero and the amount paid.': 'أدخل مبلغ استرداد جزئي بين الصفر والمبلغ المدفوع.', 'This choice is available once the material deadline has passed.': 'يتاح هذا الخيار بعد انقضاء موعد تسليم المادة.',
  'The creative was approved.': 'اعتُمدت المادة الإعلانية.', 'Your card was declined.': 'رُفضت بطاقتك.', 'Only a paid booking that has not run can be cancelled.': 'لا يُلغى إلا حجز مدفوع لم يُبث بعد.',
  'This booking can no longer be cancelled for a refund: the creative deadline has passed.': 'لم يعد ممكنًا إلغاء هذا الحجز مع الاسترداد: انقضى موعد تسليم المادة الإعلانية.',
  'Stripe answered {}': 'ردّ Stripe: {1}',
  // Team and settings
  'This user cannot be suspended or restored.': 'لا يمكن إيقاف هذا المستخدم أو إعادة تفعيله.', 'Only active buyer or seller users can be suspended or restored.': 'لا يُوقف أو يُعاد تفعيل إلا مستخدمو المشترين أو الناشرين النشطون.',
  'Only the founder can add a founder.': 'وحده المؤسس يمكنه إضافة مؤسس.', 'Only a failed payout or refund can be retried.': 'لا تُعاد المحاولة إلا لتحويل أو استرداد فشل.',
  'The high estimate must not be below the low one.': 'يجب ألا يقل التقدير الأعلى عن الأدنى.', 'Nothing to change.': 'لا شيء لتغييره.', 'Only outlets not on Nashr can be edited here.': 'لا يمكن هنا تعديل إلا المنصات غير المنضمة إلى نشر.',
  'Only the founder can change financial settings.': 'وحده المؤسس يمكنه تغيير الإعدادات المالية.', 'Unknown setting.': 'إعداد غير معروف.', 'This setting takes a {}.': 'يأخذ هذا الإعداد قيمة من نوع {1}.',
  'Use a whole number, zero or more.': 'استخدم عددًا صحيحًا، صفرًا أو أكثر.', 'number': 'رقم', 'boolean': 'صح أو خطأ', 'string': 'نص', 'list': 'قائمة',
  // Timeline notes and ledger references
  'Another request was accepted': 'قُبل طلب آخر', 'Corrected proof accepted': 'قُبل الإثبات المصحّح', 'Partial refund accepted': 'قُبل الاسترداد الجزئي', 'Rerun accepted': 'قُبلت إعادة البث', 'Inside the free cancellation window': 'ضمن مهلة الإلغاء المجاني', 'Cancellation fee applies': 'تُطبَّق رسوم الإلغاء',
  'The buyer did not supply the creative': 'لم يسلّم المشتري المادة الإعلانية', 'Corrected proof': 'إثبات مصحّح', 'card cost kept from refund': 'رسوم البطاقة مقتطعة من الاسترداد',
  'card cost recoverable from seller': 'رسوم البطاقة مستحقة على الناشر', 'deducted from payout': 'مخصومة من التحويل', 'fee {}': 'رسوم {1}',
  // Receipts and invoices
  '{} · {} · {}': '{1} · {2} · {3}',
  "Booking confirmed by the publisher, arranged by Nashr as the publisher's agent. Pay by the deadline to secure the slot. This is not a tax invoice.": 'حجز أكّده الناشر، رتّبته نشر بصفتها وكيلًا عن الناشر. ادفع قبل الموعد لتأمين المساحة. هذه ليست فاتورة ضريبية.',
  // Slot names the server writes for packages
  'Any break': 'أي فاصل', 'All {} breaks': 'الفواصل الـ{1} كلها',
  // Withdrawing a request; editing a placement
  'Only a buy-now request the publisher has not answered can be withdrawn.': 'لا يمكن سحب إلا طلب شراء فوري لم يردّ عليه الناشر.', 'Withdrawn by the buyer': 'سحبه المشتري',
  'This placement is not yours.': 'هذه المساحة الإعلانية ليست لك.', 'Set a reserve price to accept bids automatically.': 'حدّد سعرًا أدنى لقبول المزايدات تلقائيًا.',
  'The reserve cannot be above the buy-now price.': 'لا يمكن أن يتجاوز السعر الأدنى سعر الشراء الفوري.',
  // Messages
  'Write a message first.': 'اكتب رسالة أولًا.', 'Messages open once the booking is paid.': 'تُفتح الرسائل بعد دفع الحجز.',
  'This deal is finished, so the conversation is closed.': 'انتهت الصفقة، لذا أُغلقت المحادثة.',
  'Payment for Order {}: {} · {} · {}': 'دفعة الطلب {1}: {2} · {3} · {4}', '{} · {} · {} · Order {}': '{1} · {2} · {3} · الطلب {4}', 'Order {}': 'الطلب {1}', 'Nashr commission ({}%) on Order {}': 'عمولة نشر ({1}%) على الطلب {2}',
  'Credit for invoice {}': 'إشعار دائن للفاتورة {1}', 'Received by Nashr on behalf of {}. This is not a tax invoice.': 'استلمتها نشر نيابة عن {1}. هذه ليست فاتورة ضريبية.',
  'Issued by Nashr on behalf of {}.': 'أصدرتها نشر نيابة عن {1}.', 'Paid by deduction from your payout.': 'سُدّدت بالخصم من تحويلك.',
  "Add the client's name.": "أضف اسم العميل.",
  "A UAE TRN has 15 digits.": "الرقم الضريبي في الإمارات من 15 رقمًا.",
  "Leave out email addresses and phone numbers.": "لا تكتب عناوين البريد الإلكتروني وأرقام الهواتف.",
  "You already have a client with this name.": "لديك عميل بهذا الاسم بالفعل.",
  "Choose one of your active clients.": "اختر أحد عملائك النشطين.",
  "Choose one of your clients.": "اختر أحد عملائك.",
  "This campaign is for another client.": "هذه الحملة لعميل آخر.",
  "This would take {} over its budget: {} is left.": "سيتجاوز هذا ميزانية {1}: المتبقي {2}.",
  "The timer job last ran {} ago: auctions do not close and deadlines do not pass.": "آخر تشغيل لمهمة المؤقت كان قبل {1}: المزادات لا تُغلق والمهل لا تنقضي.",
  "The timer job has not run yet.": "لم تعمل مهمة المؤقت بعد.",
  "A payout or refund has been waiting {}. Check Funds.": "تحويل أو استرداد ينتظر منذ {1}. راجع الأموال.",
  "{} payout or refund failed and needs a person. Check Funds.": "فشل {1} تحويل أو استرداد ويحتاج إلى متابعة. راجع الأموال.",
  "The ledger and the payment provider disagree on the cash Nashr holds. Check Funds.": "السجل المحاسبي ومزود الدفع مختلفان على النقد الذي تحتفظ به نشر. راجع الأموال.",
  "{} email could not be sent in the last day. Check Emails.": "تعذّر إرسال {1} بريد خلال اليوم الماضي. راجع رسائل البريد.",
  "Emails have been retrying for {}. Check Emails.": "تُعاد محاولة إرسال الرسائل منذ {1}. راجع رسائل البريد.",
  "{} dispute is past its decision date. Check Disputes.": "{1} نزاع تجاوز موعد قراره. راجع النزاعات.",
  "{} server errors in the last 10 minutes, latest: {}. Check the logs (journalctl -u nashr).": "{1} خطأ في الخادم خلال آخر 10 دقائق، آخرها: {2}. راجع السجلات (journalctl -u nashr).",
  "The last backup failed. Check: journalctl -u nashr-backup.": "فشلت آخر نسخة احتياطية. راجع: journalctl -u nashr-backup.",
  "The last backup is {} old.": "عمر آخر نسخة احتياطية {1}.",
  "No backup has been made yet.": "لم تُنشأ أي نسخة احتياطية بعد.",
  "The last restore drill failed: a backup may not restore. Check: journalctl -u nashr-restore-drill.": "فشلت آخر تجربة استعادة: قد لا تُستعاد نسخة احتياطية. راجع: journalctl -u nashr-restore-drill.",
  "No restore drill has passed for over a week.": "لم تنجح أي تجربة استعادة منذ أكثر من أسبوع.",
  "Only a request waiting on you can get a counter offer.": "لا يمكن تقديم عرض مقابل إلا على طلب ينتظر قرارك.",
  "A counter offer needs a different price. To take this price, accept the request.": "العرض المقابل يحتاج سعرًا مختلفًا. لتأخذ هذا السعر، اقبل الطلب.",
  "There is no counter offer to answer.": "لا يوجد عرض مقابل للرد عليه.",
  "This submission is with Nashr or already decided, so it cannot be changed.": "هذا الطلب لدى نشر أو تم البت فيه، لذا لا يمكن تعديله.",
  "This submission was not found.": "لم يُعثر على هذا الطلب.",
  "This submission is already with Nashr.": "هذا الطلب لدى نشر بالفعل.",
  "Only a submission waiting for review can be decided.": "لا يمكن البت إلا في طلب بانتظار المراجعة.",
  "Say what needs changing, so the publisher can act on it.": "وضّح ما يحتاج إلى تعديل ليتمكن الناشر من العمل عليه.",
  "Every coverage date has passed. Ask the publisher for new dates.": "مرّت كل تواريخ التغطية. اطلب من الناشر تواريخ جديدة.",
  "Choose one of your outlets.": "اختر أحد منافذك.",
  "Add the programme or show name.": "أضف اسم البرنامج أو العرض.",
  "Choose the type.": "اختر النوع.",
  "Choose the format.": "اختر الشكل.",
  "Add the duration in minutes.": "أضف المدة بالدقائق.",
  "Choose how often it runs.": "اختر عدد مرات العرض.",
  "Add at least one coverage date.": "أضف تاريخ تغطية واحدًا على الأقل.",
  "Coverage dates must be today or later.": "يجب أن تكون تواريخ التغطية اليوم أو بعده.",
  "Add the time (UAE).": "أضف الوقت (الإمارات).",
  "Choose at least one coverage type.": "اختر نوع تغطية واحدًا على الأقل.",
  "Add the editorial angle or key message.": "أضف الزاوية التحريرية أو الرسالة الرئيسية.",
  "Add the estimated reach.": "أضف الوصول المتوقع.",
  "Choose at least one deliverable.": "اختر مخرجًا واحدًا على الأقل.",
  "Say what the other deliverable is.": "وضّح ما هو المخرج الآخر.",
  "Choose where the coverage appears.": "اختر أين تظهر التغطية.",
  "Add the base price.": "أضف السعر الأساسي.",
  "Choose how it sells: fixed price or bidding.": "اختر طريقة البيع: سعر ثابت أو مزايدة.",
  "Add the product name.": "أضف اسم المنتج.",
  "Add a description.": "أضف وصفًا.",
  "Keep it to 500 characters.": "لا تتجاوز 500 حرف.",
  "This product was not found.": "لم يُعثر على هذا المنتج.",
  "This media type was not found.": "لم يُعثر على نوع الوسيلة هذا.",
  "The media type cannot change once it is added. Add a new one instead.": "لا يمكن تغيير نوع الوسيلة بعد إضافته. أضف نوعًا جديدًا بدلًا منه.",
  "Only Radio, TV and Podcast have programmes.": "البرامج للإذاعة والتلفزيون والبودكاست فقط.",
  "Add the programme name.": "أضف اسم البرنامج.",
  "This programme was not found.": "لم يُعثر على هذا البرنامج.",
  "Buy-now and minimum accepted prices are for auctions only.": "سعر الشراء الفوري والحد الأدنى المقبول للمزادات فقط.",
  "The minimum accepted cannot be above the buy-now price.": "لا يمكن أن يتجاوز الحد الأدنى المقبول سعر الشراء الفوري.",
  "Add the start and end time.": "أضف وقت البداية والنهاية.",
  "Add each break with its time.": "أضف كل فاصل مع وقته.",
  "Fill in {}.": "املأ {1}.",
  "Pick the media type.": "اختر نوع الوسيلة.",
  "Say what the media type is.": "وضّح نوع الوسيلة.",
  "Add the name buyers see.": "أضف الاسم الذي يراه المشترون.",
  "Pick the language.": "اختر اللغة.",
  "Describe the audience.": "صِف الجمهور.",
  "Pick at least one market.": "اختر سوقًا واحدًا على الأقل.",
  "Add the default price.": "أضف السعر الافتراضي.",
  "Add when the creative is due.": "أضف موعد المادة الإعلانية.",
  "Add when bidding closes.": "أضف موعد انتهاء المزايدة.",
  "Pick the creative file type.": "اختر نوع ملف المادة الإعلانية.",
  "Bidding must close at least 3 days before the creative is due (1 day for you to decide, 2 for the buyer to pay).": "يجب أن تنتهي المزايدة قبل موعد المادة الإعلانية بثلاثة أيام على الأقل (يوم لتقرر، ويومان ليدفع المشتري).",
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const exact = new Map(Object.entries(SERVER_AR).filter(([k]) => !k.includes('{}')))
// Longest fixed text first, so "{} · {} · {} · Order {}" is tried before "Order {}".
const patterns = Object.entries(SERVER_AR).filter(([k]) => k.includes('{}'))
  .sort((a, b) => b[0].replace(/\{\}/g, '').length - a[0].replace(/\{\}/g, '').length)
  .map(([k, v]) => [new RegExp('^' + k.split('{}').map(esc).join('(.+?)') + '$', 's'), v] as const)

/** A value inside a message: a known word or list ("the as-run log and the audio clip") is translated too. */
const word = (v: string): string => exact.get(v) ?? AR[v] ?? (/^AED [\d,.]+$/.test(v) ? `${v.slice(4)} درهم` : /^\d{4,}(\.\d+)?$/.test(v) ? Number(v).toLocaleString('en-US') : v.includes(' and ') ? v.split(' and ').map(word).join(' و') : v)

function one(s: string): string | null {
  const hit = exact.get(s) ?? AR[s]
  if (hit) return hit
  if (/^[a-z]+(_[a-z]+)+$/.test(s)) return AR[s.replace(/_/g, ' ')] ?? null // a reason code such as wrong_time
  for (const [re, ar] of patterns) {
    const m = s.match(re)
    if (m) return ar.replace(/\{(\d)\}/g, (_, i) => word(m[Number(i)]))
  }
  return null
}

/**
 * A message from the server, in the reader's language. Several checks can arrive joined in one message (the brief), and
 * some messages are two sentences long: from each sentence, the longest run of sentences that is a known message wins.
 */
export function arabicFor(msg: string | null | undefined): string {
  if (!msg) return ''
  const whole = one(msg)
  if (whole) return whole
  const parts = msg.split(/(?<=[.!?:])\s+(?=[A-Z])/), out: string[] = []
  for (let i = 0; i < parts.length;) {
    let j = parts.length, hit: string | null = null
    for (; j > i && !(hit = one(parts.slice(i, j).join(' '))); j--);
    if (hit) { out.push(hit); i = j } else out.push(parts[i++])
  }
  return out.join(' ')
}
