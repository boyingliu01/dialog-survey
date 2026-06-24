import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DingTalkClient } from '../src/integrations/dingtalk/client.js';
import { verifyPhoneToName } from '../src/services/member-verification.service.js';

/**
 * @test REQ-TBD-01
 * @intent 验证 verifyPhoneToName 在手机号匹配且姓名也匹配时返回 verified=true
 */
describe('verifyPhoneToName', () => {
  let mockClient: { getUserIdByMobile: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { getUserIdByMobile: vi.fn() };
  });

  describe('name matches', () => {
    /**
     * @test REQ-TBD-01
     * @intent 钉钉返回姓名与输入一致 — 返回 verified=true 和真实 name
     */
    it('should return verified=true when phone resolves and name matches exactly', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'user_zhangsan',
        name: '张三',
      });

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138000',
        '张三'
      );

      expect(result.verified).toBe(true);
      expect(result.userId).toBe('user_zhangsan');
      expect(result.name).toBe('张三');
    });

    /**
     * @test REQ-TBD-01
     * @intent 钉钉返回姓名与输入一致（忽略首尾空格）— 返回 verified=true
     */
    it('should return verified=true when name matches after trimming whitespace', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'user_lisi',
        name: '李四',
      });

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13900139000',
        '  李四  '
      );

      expect(result.verified).toBe(true);
      expect(result.name).toBe('李四');
    });
  });

  describe('name mismatch', () => {
    /**
     * @test REQ-TBD-02
     * @intent 输入姓名与钉钉注册姓名不一致 — 返回 verified=false 和钉钉端的真实姓名
     */
    it('should return verified=false when provided name differs from DingTalk name', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'user_zhangsan',
        name: '张三',
      });

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138000',
        '李四'
      );

      expect(result.verified).toBe(false);
      expect(result.userId).toBe('user_zhangsan');
      expect(result.name).toBe('张三');
    });

    /**
     * @test REQ-TBD-02
     * @intent 输入姓名为空 — 此时应使用钉钉返回的姓名，视为验证通过
     */
    it('should return verified=true when no name is provided (DingTalk fallback)', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'user_wangwu',
        name: '王五',
      });

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138001',
        ''
      );

      expect(result.verified).toBe(true);
      expect(result.name).toBe('王五');
    });

    /**
     * @test REQ-TBD-02
     * @intent 输入姓名为 undefined — 使用钉钉返回的姓名
     */
    it('should return verified=true when name is undefined', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'user_undefined',
        name: '赵六',
      });

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138002'
      );

      expect(result.verified).toBe(true);
      expect(result.name).toBe('赵六');
    });
  });

  describe('phone resolution failures', () => {
    /**
     * @test REQ-TBD-03
     * @intent 手机号在钉钉中未注册 — 返回 verified=false 且抛出的错误包含描述信息
     */
    it('should return verified=false when phone is not found in DingTalk', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({ found: false });

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800000000',
        '张三'
      );

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not found');
      expect(result.userId).toBeUndefined();
    });

    /**
     * @test REQ-TBD-03
     * @intent 钉钉 API 调用抛出异常 — 返回 verified=false
     */
    it('should return verified=false when DingTalk API throws', async () => {
      mockClient.getUserIdByMobile.mockRejectedValue(new Error('Network timeout'));

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800000001',
        '张三'
      );

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('unavailable');
    });
  });

  describe('name comparison handling', () => {
    /**
     * @test REQ-TBD-04
     * @intent 钉钉返回的姓名为空字符串 — 视为无法验证，显示警告但通过
     */
    it('should return verified=true when DingTalk returns empty name (cannot verify)', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'user_no_name',
        name: '',
      });

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138003',
        '张三'
      );

      // When DingTalk returns empty name, we can't verify but still resolve userId,
      // and we keep the provided name since DingTalk has no name to compare against
      expect(result.verified).toBe(true);
      expect(result.userId).toBe('user_no_name');
      expect(result.name).toBe('张三');
    });
  });
});
