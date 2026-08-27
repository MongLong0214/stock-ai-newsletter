import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/seo/config';
import LegalPage, { LegalSection } from '@/app/_components/legal/legal-page';

/** 사업자 등록 없이 개인이 운영하는 무료 서비스. 법인 관련 기재사항은 해당 없음. */
const OPERATOR = {
  contactEmail: 'aistockmatrix@gmail.com',
} as const;

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description:
    'StockMatrix 뉴스레터가 수집하는 개인정보 항목, 이용 목적, 보유 기간, 제3자 제공 및 처리위탁 현황과 정보주체의 권리를 안내합니다.',
  alternates: { canonical: `${siteConfig.domain}/privacy` },
};

function PrivacyPolicyPage() {
  return (
    <LegalPage title="개인정보처리방침" effectiveDate="2026-08-25">
      <LegalSection title="1. 수집하는 개인정보 항목">
        <p>
          StockMatrix는 무료 뉴스레터 발송을 위해 아래 항목만 수집합니다. 회원가입 절차나
          결제 수단은 존재하지 않으며, 주민등록번호 등 고유식별정보는 일절 수집하지 않습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>필수: 이메일 주소</li>
          <li>선택: 이름(호칭) — 미입력 시에도 구독 가능</li>
          <li>
            서비스 이용 과정에서 자동 생성·수집되는 정보: 접속 로그, 브라우저·기기 정보,
            쿠키 및 유사 식별자
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. 개인정보의 수집 및 이용 목적">
        <ul className="list-disc space-y-1 pl-5">
          <li>매일 오전 7시 30분 AI 기술적 분석 뉴스레터 발송</li>
          <li>구독 확인 및 구독 해지 처리</li>
          <li>서비스 이용 통계 분석 및 품질 개선</li>
        </ul>
        <p>
          수집한 개인정보를 위 목적 외의 용도로 이용하지 않으며, 목적이 변경되는 경우
          사전에 동의를 받습니다.
        </p>
      </LegalSection>

      <LegalSection title="3. 보유 및 이용 기간">
        <p>
          구독 해지 요청 시 지체 없이 파기합니다. 구독자가 뉴스레터 하단의 구독 해지 링크를
          이용하거나 아래 문의처로 요청하면 즉시 처리됩니다. 관계 법령에 따라 보존이 필요한
          경우에는 해당 법령이 정한 기간 동안 보관합니다.
        </p>
      </LegalSection>

      <LegalSection title="4. 개인정보의 제3자 제공">
        <p>
          StockMatrix는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 근거해
          수사기관 등이 적법한 절차에 따라 요구하는 경우에는 예외로 합니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 개인정보 처리의 위탁">
        <p>서비스 운영을 위해 아래 사업자에게 개인정보 처리를 위탁하고 있습니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase — 구독자 데이터베이스 저장 및 관리</li>
          <li>Amazon Web Services (Amazon SES) — 뉴스레터 이메일 발송</li>
          <li>Vercel — 웹사이트 호스팅 및 접속 로그 처리</li>
          <li>Google (Google Analytics 4) — 웹사이트 이용 통계 분석</li>
          <li>Microsoft (Clarity) — 웹사이트 이용 행태 분석</li>
        </ul>
        <p>
          위 사업자의 서버는 국외에 위치할 수 있으며, 이 경우 개인정보가 국외로 이전됩니다.
          이전 항목·국가·시점·방법은 본 방침의 수집 항목 및 위탁 내역과 같습니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 쿠키 및 분석 도구">
        <p>
          웹사이트 이용 통계 분석을 위해 쿠키와 유사 식별자를 사용합니다. 이용자는 브라우저
          설정을 통해 쿠키 저장을 거부할 수 있으며, 이 경우 일부 기능 이용에 제한이 있을 수
          있습니다. 뉴스레터 구독 자체에는 쿠키가 필요하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 정보주체의 권리와 행사 방법">
        <p>
          이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수
          있습니다. 아래 문의처로 요청하시면 관계 법령이 정한 기간 내에 처리합니다. 구독
          해지는 모든 뉴스레터 하단의 구독 해지 링크로 즉시 가능합니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 개인정보의 파기">
        <p>
          보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.
          전자적 파일 형태의 정보는 복구가 불가능한 방법으로 삭제합니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 안전성 확보 조치">
        <p>
          개인정보 접근 권한을 최소 인원으로 제한하고, 전송 구간은 HTTPS로 암호화하며,
          데이터베이스는 행 수준 보안(RLS) 정책으로 접근을 통제합니다.
        </p>
      </LegalSection>

      <LegalSection title="10. 문의처">
        <p>
          본 서비스는 사업자 등록 없이 개인이 운영하는 무료 서비스이며, 개인정보 처리에 관한
          문의와 열람·정정·삭제 요청은 아래로 접수합니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>문의: {OPERATOR.contactEmail}</li>
        </ul>
        <p>
          개인정보 침해에 대한 신고·상담이 필요한 경우 개인정보침해신고센터(privacy.kisa.or.kr,
          국번없이 118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972), 대검찰청
          사이버수사과(1301), 경찰청 사이버수사국(ecrm.police.go.kr, 182)에 문의할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="11. 방침의 변경">
        <p>
          본 방침이 변경되는 경우 시행일 최소 7일 전에 본 페이지를 통해 공지합니다. 이용자에게
          불리한 변경의 경우 최소 30일 전에 공지합니다.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

export default PrivacyPolicyPage;
