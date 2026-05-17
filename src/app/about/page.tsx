import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "אודות — בדוק",
  description: "מי אנחנו, איך אנחנו בודקים עובדות, ולמה החלטנו שזה חשוב",
};

export default function AboutPage() {
  return (
    <article className="prose prose-sm max-w-2xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-black mb-2">אודות בדוק</h1>
      <p className="text-gray-500 mb-8">בדיקת עובדות לפוליטיקאים ישראליים — בלתי תלוי, ללא שיוך פוליטי</p>

      <Section title="מה אנחנו עושים">
        אנחנו אוספים טענות פומביות של פוליטיקאים ישראליים, ובודקים האם הן נכונות, חצי-נכונות או שגויות.
        כל טענה מקושרת למקור שבו נאמרה, וההסבר מציין את המקור הרשמי שעליו התבססה הבדיקה.
      </Section>

      <Section title="גישתנו לעדר העובדות">
        <ul className="list-disc pr-5 space-y-1.5">
          <li>אנו בודקים <strong>טענות עובדתיות בלבד</strong> — לא דעות, לא הבטחות עתידיות שאי-אפשר לאמת.</li>
          <li>אנו בודקים <strong>רק דברים שהפוליטיקאי אמר בעצמו</strong> — לא ניתוחים שעיתונאים כתבו עליו.</li>
          <li>כל בדיקה מקושרת ל<strong>מקור ציבורי בר-בדיקה</strong> (הלמ&quot;ס, בנק ישראל, פרוטוקולי כנסת וכד&apos;).</li>
        </ul>
      </Section>

      <Section title="ללא שיוך פוליטי">
        <p>
          אין לנו שיוך, מימון או אינטרס מאף מפלגה, גוף פוליטי או תורם. בודקים כל פוליטיקאי באותה מידה,
          באותו פרוטוקול, באותם כלים.
        </p>
        <p>
          אנחנו לא חושבים שמישהו &ldquo;צריך להפסיד&rdquo; או &ldquo;צריך לנצח&rdquo; — אנחנו רק רוצים שאזרחים יוכלו לדעת
          אם המידע שמגיע אליהם נכון.
        </p>
      </Section>

      <Section title="איך זה עובד">
        <ol className="list-decimal pr-5 space-y-1.5">
          <li>מערכת אוטומטית סורקת מקורות חדשותיים פעם ביום ומחפשת ציטוטים של פוליטיקאים.</li>
          <li>מודל בינה מלאכותית מחלץ את הטענות העובדתיות הניתנות לאימות.</li>
          <li>מודל נוסף בודק כל טענה מול מקורות רשמיים ומחזיר פסק דין.</li>
          <li>הציבור יכול לדווח על שגיאות ולהוסיף הקשר בתגובות לכל טענה.</li>
        </ol>
      </Section>

      <Section title="מגבלות שצריך לדעת">
        <ul className="list-disc pr-5 space-y-1.5">
          <li>הבדיקה נעשית על ידי AI ועלולה להכיל שגיאות — תמיד בדקו את המקורות בעצמכם.</li>
          <li>חלק מהציטוטים שנמצאים בחדשות הם פרפרזות של מה שהפוליטיקאי אמר, לא תמלולים מדויקים.</li>
          <li>נושאים שנויים במחלוקת לעיתים מקבלים פסק דין &ldquo;חצי-אמת&rdquo; — לא מתוך נוחיות אלא כי האמת אכן חלקית.</li>
          <li>הבטחות לגבי העתיד לא מקבלות פסק דין — כי אי-אפשר עדיין לאמת אותן.</li>
        </ul>
      </Section>

      <Section title="מי בנה את האתר">
        <p>
          האתר נבנה על ידי <a href="https://x.com/opitaru" target="_blank" rel="noopener noreferrer" className="underline">Omri Pitaru</a>
          {" "}כפרויקט אישי. הקוד פתוח ושקוף — אם יש לכם הצעות, באגים או שיפורים, מוזמנים לפנות.
        </p>
      </Section>

      <Section title="מצאתם שגיאה?">
        <p>
          לכל טענה יש כפתור &ldquo;דיווח על שגיאה&rdquo;. הדיווחים נשמרים, נבדקים ידנית, והטענות מתוקנות במידת הצורך.
          אפשר גם להגיב על כל טענה ולהוסיף הקשר, מקור, או תיקון.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold mb-3">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
