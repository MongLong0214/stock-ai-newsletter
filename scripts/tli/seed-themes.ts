import 'dotenv/config';
import { supabaseAdmin } from './supabase-admin';

interface ThemeData {
  name: string;
  name_en: string;
  keywords: string[];
  naverKeywords: string[];
}

const THEMES: ThemeData[] = [
  {
    name: 'AI 반도체',
    name_en: 'AI Semiconductor',
    keywords: ['AI반도체', 'HBM', '인공지능', '엔비디아', 'GPU'],
    naverKeywords: ['AI반도체', 'HBM'],
  },
  {
    name: '로봇',
    name_en: 'Robot',
    keywords: ['로봇', '휴머노이드', '자동화', '보스턴다이나믹스', '테슬라봇'],
    naverKeywords: ['로봇주', '휴머노이드로봇'],
  },
  {
    name: '2차전지',
    name_en: 'Secondary Battery',
    keywords: ['2차전지', '배터리', '리튬', 'LFP', '전고체'],
    naverKeywords: ['2차전지', '전고체배터리'],
  },
  {
    name: '방산',
    name_en: 'Defense',
    keywords: ['방산', '방위산업', 'K방산', '무기수출', '한화에어로스페이스'],
    naverKeywords: ['방산주', 'K방산'],
  },
  {
    name: '바이오',
    name_en: 'Bio',
    keywords: ['바이오', '신약', '임상', '제약', '바이오시밀러'],
    naverKeywords: ['바이오주', '신약개발'],
  },
  {
    name: '원전',
    name_en: 'Nuclear',
    keywords: ['원전', '원자력', 'SMR', '소형모듈원자로'],
    naverKeywords: ['원전주', 'SMR'],
  },
  {
    name: 'UAM',
    name_en: 'UAM',
    keywords: ['UAM', '도심항공', '에어택시', '플라잉카'],
    naverKeywords: ['UAM', '도심항공모빌리티'],
  },
  {
    name: '양자컴퓨팅',
    name_en: 'Quantum',
    keywords: ['양자컴퓨팅', '양자', '큐비트', '양자암호'],
    naverKeywords: ['양자컴퓨터', '양자컴퓨팅'],
  },
  {
    name: '메타버스',
    name_en: 'Metaverse',
    keywords: ['메타버스', 'VR', 'AR', '가상현실', 'XR'],
    naverKeywords: ['메타버스', '가상현실'],
  },
  {
    name: 'NFT',
    name_en: 'NFT',
    keywords: ['NFT', '대체불가토큰', '디지털자산'],
    naverKeywords: ['NFT', '대체불가토큰'],
  },
];

async function seedThemes() {
  console.log('🌱 Starting theme seeding...\n');

  try {
    for (const theme of THEMES) {
      console.log(`📝 Processing theme: ${theme.name} (${theme.name_en})`);

      // Insert or update theme
      const { data: themeData, error: themeError } = await supabaseAdmin
        .from('themes')
        .upsert(
          {
            name: theme.name,
            name_en: theme.name_en,
            is_active: true,
          },
          { onConflict: 'name' }
        )
        .select()
        .single();

      if (themeError) {
        console.error(`❌ Error inserting theme ${theme.name}:`, themeError);
        continue;
      }

      const themeId = themeData.id;
      console.log(`   ✅ Theme inserted/updated with ID: ${themeId}`);

      // Insert general keywords
      for (let i = 0; i < theme.keywords.length; i++) {
        const keyword = theme.keywords[i];
        const { error: keywordError } = await supabaseAdmin
          .from('theme_keywords')
          .upsert(
            {
              theme_id: themeId,
              keyword,
              source: 'general',
              is_primary: i === 0, // First keyword is primary
            },
            { onConflict: 'theme_id,keyword,source' }
          );

        if (keywordError) {
          console.error(`   ⚠️ Error inserting keyword ${keyword}:`, keywordError);
        } else {
          console.log(`   ✓ Keyword: ${keyword} (general${i === 0 ? ', primary' : ''})`);
        }
      }

      // Insert naver-specific keywords
      for (const keyword of theme.naverKeywords) {
        const { error: keywordError } = await supabaseAdmin
          .from('theme_keywords')
          .upsert(
            {
              theme_id: themeId,
              keyword,
              source: 'naver',
              is_primary: false,
            },
            { onConflict: 'theme_id,keyword,source' }
          );

        if (keywordError) {
          console.error(`   ⚠️ Error inserting naver keyword ${keyword}:`, keywordError);
        } else {
          console.log(`   ✓ Keyword: ${keyword} (naver)`);
        }
      }

      console.log('');
    }

    console.log('✨ Theme seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedThemes();
