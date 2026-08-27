import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/seo/config';
import LegalPage, { LegalSection } from '@/app/_components/legal/legal-page';

export const metadata: Metadata = {
  title: '이용약관',
  description:
    'StockMatrix 무료 AI 주식 분석 뉴스레터 서비스의 이용 조건, 이용자의 의무, 서비스 제공자의 책임 범위와 면책 사항을 안내합니다.',
  alternates: { canonical: `${siteConfig.domain}/terms` },
};

function TermsPage() {
  return (
    <LegalPage title="이용약관" effectiveDate="2026-08-25">
      <LegalSection title="제1조 (목적)">
        <p>
          본 약관은 StockMatrix(이하 &ldquo;서비스&rdquo;)가 제공하는 무료 AI 주식 기술적 분석
          뉴스레터 및 웹사이트 이용에 관한 조건과 절차, 이용자와 서비스의 권리·의무를 정하는 것을
          목적으로 합니다.
        </p>
      </LegalSection>

      <LegalSection title="제2조 (서비스의 성격 — 중요)">
        <p>
          본 서비스는 인공지능이 공개 시장 데이터로부터 기술적 지표를 수집·분석한{' '}
          <strong className="font-normal text-slate-300">참고용 정보</strong>를 제공하는 정보 제공
          서비스입니다. 자본시장과 금융투자업에 관한 법률 제6조에 따른 투자권유, 투자자문,
          투자일임 등 어떠한 형태의 금융투자업 행위도 아니며, 금융투자협회에 등록된 서비스가
          아닙니다.
        </p>
        <p>
          서비스는 특정 종목의 매수·매도·보유를 권유하거나 추천하지 않으며, 매수가격·매도가격·
          손절가·목표가격 등 거래 실행과 관련된 정보를 제시하지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="제3조 (콘텐츠의 생성 방식)">
        <p>
          뉴스레터 본문, 테마 분석, 블로그 게시물을 포함한 본 서비스의 콘텐츠 상당 부분은 인공지능
          모델이 자동으로 생성합니다. 인공지능이 생성한 내용에는 사실과 다른 서술이 포함될 수
          있으므로, 이용자는 투자 판단 전 원본 데이터와 공시를 직접 확인해야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="제4조 (이용 계약의 성립 및 해지)">
        <p>
          이용자가 구독 페이지에 이메일 주소를 제출하고 서비스가 이를 접수함으로써 이용 계약이
          성립합니다. 이용자는 언제든지 뉴스레터 하단의 구독 해지 링크를 통해 계약을 해지할 수
          있으며, 별도의 위약금이나 절차는 없습니다.
        </p>
      </LegalSection>

      <LegalSection title="제5조 (이용료 및 운영 주체)">
        <p>본 서비스는 전면 무료입니다. 이용료나 결제 수단이 존재하지 않습니다.</p>
        <p>
          사업자 등록 없이 개인이 운영하며, 영리를 목적으로 하지 않습니다. 문의는
          aistockmatrix@gmail.com으로 접수합니다.
        </p>
      </LegalSection>

      <LegalSection title="제6조 (이용자의 의무)">
        <ul className="list-disc space-y-1 pl-5">
          <li>타인의 이메일 주소를 무단으로 등록하지 않을 것</li>
          <li>서비스가 제공한 콘텐츠를 투자 권유 자료로 재배포하지 않을 것</li>
          <li>자동화된 수단으로 서비스에 과도한 부하를 유발하지 않을 것</li>
          <li>서비스의 정상적인 운영을 방해하는 행위를 하지 않을 것</li>
        </ul>
      </LegalSection>

      <LegalSection title="제7조 (지식재산권)">
        <p>
          서비스가 제작한 콘텐츠에 대한 권리는 서비스에 귀속됩니다. 다만 출처를 명시한 인용은
          허용합니다. 서비스가 인용한 제3자 데이터(시장 지표, 뉴스 등)의 권리는 각 원저작권자에게
          있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제8조 (면책)">
        <p>
          AI 분석 결과 및 과거 데이터는 미래의 투자 수익률을 보장하지 않으며, 주식 투자에는 원금
          손실의 위험이 항상 존재합니다. 투자 판단 및 최종 의사결정에 대한 책임은 전적으로 이용자
          본인에게 있습니다.
        </p>
        <p>
          서비스는 제공 정보의 정확성·완전성·적시성을 보장하지 않으며, 본 정보를 이용하여 발생한
          투자 손실, 기회 손실, 데이터 오류, 시스템 장애 등 직접적·간접적·부수적·파생적 손해에
          대하여 관계 법령이 허용하는 범위에서 책임을 지지 않습니다.
        </p>
        <p>
          천재지변, 외부 데이터 제공처의 장애, 이메일 사업자의 장애 등 서비스의 합리적 통제를
          벗어난 사유로 인한 발송 지연이나 중단에 대해서도 같습니다.
        </p>
      </LegalSection>

      <LegalSection title="제9조 (서비스의 변경 및 중단)">
        <p>
          서비스는 운영상·기술상 필요에 따라 제공 내용의 전부 또는 일부를 변경하거나 중단할 수
          있습니다. 서비스 전면 종료 시에는 최소 30일 전에 공지하고 보유 중인 개인정보를
          파기합니다.
        </p>
      </LegalSection>

      <LegalSection title="제10조 (개인정보의 보호)">
        <p>
          이용자의 개인정보 처리에 관한 사항은 별도의 개인정보처리방침에 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="제11조 (약관의 변경)">
        <p>
          본 약관이 변경되는 경우 시행일 최소 7일 전에 본 페이지를 통해 공지합니다. 이용자에게
          불리한 변경의 경우 최소 30일 전에 공지하며, 이용자가 변경에 동의하지 않는 경우 구독을
          해지할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="제12조 (준거법 및 관할)">
        <p>
          본 약관은 대한민국 법률에 따라 해석되며, 서비스 이용과 관련한 분쟁은 민사소송법상의
          관할 법원에 제기합니다.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

export default TermsPage;
