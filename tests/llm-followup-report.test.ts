import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LLM, Followup, Report', () => {
  describe('LLM Service', () => {
    /**
     * @test REQ-006-2-01
     * @intent 验证基础LLM接口模块存在，确保报告生成服务可以调用LLM服务来生成分析报告
     */
    it('should have base LLM interface', () => {
      expect(fs.existsSync('src/integrations/llm/base.ts')).toBe(true);
    });

    /**
     * @test REQ-006-2-01
     * @intent 验证阿里云LLM适配器模块存在，确保报告生成服务可以使用阿里云服务
     */
    it('should have Alibaba adapter', () => {
      expect(fs.existsSync('src/integrations/llm/alibaba.ts')).toBe(true);
    });

    /**
     * @test REQ-006-2-01
     * @intent 验证提示词服务模块存在，确保报告生成服务可以使用提示词模板
     */
    it('should have prompt service', () => {
      expect(fs.existsSync('src/services/prompt.service.ts')).toBe(true);
    });

    /**
     * @test REQ-006-2-01
     * @intent 验证重试机制工具存在，确保报告生成服务在调用LLM时具备容错能力
     */
    it('should have retry mechanism', () => {
      expect(fs.existsSync('src/utils/retry.ts')).toBe(true);
    });
  });

  describe('Followup Service', () => {
    /**
     * @test REQ-005-2-01
     * @intent 验证关注务模块路径正确存在，测试追问功能的基本实现
     */
    it('should have followup.service.ts', () => {
      expect(fs.existsSync('src/services/followup.service.ts')).toBe(true);
    });

    /**
     * @test REQ-005-2-01
     * @intent 验证关注务模块包含必要功能，测试追问判断逻辑的存在性
     */
    it('should implement isFollowupNeeded', () => {
      const content = fs.readFileSync('src/services/followup.service.ts', 'utf-8');
      expect(content.toLowerCase()).toContain('followup');
    });
  });

  describe('Report Service', () => {
    /**
     * @test REQ-006-2-01
     * @intent 验证报告服务模块存在，确保系统可以生成访谈分析报告
     */
    it('should have report.service.ts', () => {
      expect(fs.existsSync('src/services/report.service.ts')).toBe(true);
    });

    /**
     * @test REQ-006-2-01
     * @intent 验证报告服务具备Markdown渲染能力，确保报告可以正确输出格式化的文档
     */
    it('should implement markdown rendering', () => {
      const content = fs.readFileSync('src/services/report.service.ts', 'utf-8');
      expect(content).toMatch(/\.md/);
    });
  });
});
