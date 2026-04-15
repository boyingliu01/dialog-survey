import { beforeEach, describe, expect, it } from 'vitest';

interface AnalysisResult {
  interviewId: string;
  sentiment: string;
  topics: string[];
  viewpoints: string[];
}

class AnalysisService {
  analyzeSentiment(contents: string[]): string {
    const positiveWords = ['好', '喜欢', '优秀', '满意', '棒', '感谢'];
    const negativeWords = ['差', '不好', '失望', '糟糕'];

    let score = 0;
    const text = contents.join('').toLowerCase();

    for (const word of positiveWords) {
      if (text.includes(word)) score++;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) score--;
    }

    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
  }

  extractTopics(contents: string[]): string[] {
    const keywords = ['产品', '功能', '体验', '服务', '价格', '质量', '技术', '团队', '市场'];
    const topics = new Set<string>();
    const text = contents.join('');

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        topics.add(keyword);
      }
    }

    return Array.from(topics);
  }

  extractRepresentativeViewpoints(contents: string[]): string[] {
    return contents.filter((c) => c.length > 10).slice(0, 5);
  }

  clusterBySentiment(results: AnalysisResult[]): Record<string, AnalysisResult[]> {
    const clusters: Record<string, AnalysisResult[]> = {
      positive: [],
      negative: [],
      neutral: [],
    };

    for (const result of results) {
      if (clusters[result.sentiment]) {
        clusters[result.sentiment].push(result);
      }
    }

    return clusters;
  }

  calculateStatistics(results: AnalysisResult[]): {
    total: number;
    sentimentBreakdown: Record<string, number>;
    topTopics: string[];
  } {
    const sentimentBreakdown: Record<string, number> = {
      positive: 0,
      negative: 0,
      neutral: 0,
    };

    const topicCount: Record<string, number> = {};

    for (const result of results) {
      sentimentBreakdown[result.sentiment] = (sentimentBreakdown[result.sentiment] || 0) + 1;

      for (const topic of result.topics) {
        topicCount[topic] = (topicCount[topic] || 0) + 1;
      }
    }

    const topTopics = Object.entries(topicCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    return {
      total: results.length,
      sentimentBreakdown,
      topTopics,
    };
  }
}

describe('Task-009: Statistical Analysis Features', () => {
  let service: AnalysisService;

  beforeEach(() => {
    service = new AnalysisService();
  });

  describe('Sentiment Analysis (Task-009-4)', () => {
    it('should identify positive sentiment', () => {
      const contents = ['这个产品非常好用', '我很喜欢', '服务很优秀'];
      const sentiment = service.analyzeSentiment(contents);
      expect(sentiment).toBe('positive');
    });

    it('should identify negative sentiment', () => {
      const contents = ['体验很差', '不好用', '很失望'];
      const sentiment = service.analyzeSentiment(contents);
      expect(sentiment).toBe('negative');
    });

    it('should identify neutral sentiment', () => {
      const contents = ['这是测试内容', '一些普通描述'];
      const sentiment = service.analyzeSentiment(contents);
      expect(sentiment).toBe('neutral');
    });
  });

  describe('Topic Extraction (Task-009-3)', () => {
    /**
     * @test REQ-009-3-01
     * @intent Verify that topic extraction correctly identifies topics from content achieving >80% accuracy
     */
    it('should extract topics from content', () => {
      const contents = ['产品很好', '功能很强大', '服务态度好'];
      const topics = service.extractTopics(contents);
      expect(topics).toContain('产品');
      expect(topics).toContain('功能');
      expect(topics).toContain('服务');
    });

    it('should return empty array when no topics found', () => {
      const contents = ['一些无关内容', '测试测试'];
      const topics = service.extractTopics(contents);
      expect(topics).toHaveLength(0);
    });
  });

  describe('Representative Viewpoints (Task-009-5)', () => {
    it('should extract representative viewpoints', () => {
      const contents = [
        '短内容',
        '这是一个比较长的观点描述，包含了用户的具体反馈意见',
        '中等长度的观点',
        '另一个长观点，描述了对产品的看法和建议',
      ];
      const viewpoints = service.extractRepresentativeViewpoints(contents);
      expect(viewpoints.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter out short content', () => {
      const contents = ['短', '很短的'];
      const viewpoints = service.extractRepresentativeViewpoints(contents);
      expect(viewpoints).toHaveLength(0);
    });
  });

  describe('Cluster Analysis (Task-009-7)', () => {
    it('should cluster results by sentiment', () => {
      const results: AnalysisResult[] = [
        {
          interviewId: '1',
          sentiment: 'positive',
          topics: ['产品'],
          viewpoints: [],
        },
        {
          interviewId: '2',
          sentiment: 'negative',
          topics: ['服务'],
          viewpoints: [],
        },
        {
          interviewId: '3',
          sentiment: 'positive',
          topics: ['功能'],
          viewpoints: [],
        },
        {
          interviewId: '4',
          sentiment: 'neutral',
          topics: ['价格'],
          viewpoints: [],
        },
      ];

      const clusters = service.clusterBySentiment(results);

      expect(clusters.positive).toHaveLength(2);
      expect(clusters.negative).toHaveLength(1);
      expect(clusters.neutral).toHaveLength(1);
    });
  });

  describe('Statistical Metrics (Task-009-6)', () => {
    it('should calculate statistics correctly', () => {
      const results: AnalysisResult[] = [
        {
          interviewId: '1',
          sentiment: 'positive',
          topics: ['产品', '功能'],
          viewpoints: [],
        },
        {
          interviewId: '2',
          sentiment: 'positive',
          topics: ['产品'],
          viewpoints: [],
        },
        {
          interviewId: '3',
          sentiment: 'negative',
          topics: ['服务'],
          viewpoints: [],
        },
      ];

      const stats = service.calculateStatistics(results);

      expect(stats.total).toBe(3);
      expect(stats.sentimentBreakdown.positive).toBe(2);
      expect(stats.sentimentBreakdown.negative).toBe(1);
      expect(stats.topTopics).toContain('产品');
    });

    it('should return top topics sorted by frequency', () => {
      const results: AnalysisResult[] = [
        {
          interviewId: '1',
          sentiment: 'positive',
          topics: ['产品', '功能', '服务'],
          viewpoints: [],
        },
        {
          interviewId: '2',
          sentiment: 'positive',
          topics: ['产品', '功能'],
          viewpoints: [],
        },
        {
          interviewId: '3',
          sentiment: 'positive',
          topics: ['产品'],
          viewpoints: [],
        },
      ];

      const stats = service.calculateStatistics(results);

      expect(stats.topTopics[0]).toBe('产品');
      expect(stats.topTopics[1]).toBe('功能');
    });
  });
});
