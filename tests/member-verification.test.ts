import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DingTalkClient } from '../src/integrations/dingtalk/client.js';
import { verifyPhoneToName } from '../src/services/member-verification.service.js';
import * as logger from '../src/utils/logger.js';

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
      expect(result.reason).toContain('该手机号未在钉钉通讯录中注册');
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
      expect(result.reason).toContain('钉钉服务暂时不可用');
    });
  });

  describe('failure classification and logging (issue #198)', () => {
    /**
     * @test REQ-TBD-05
     * @intent 凭据缺失（errcode 40035）必须与网络故障区分开，且原始错误落入日志
     */
    it('classifies a missing-credential error as credential_missing and logs the cause', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mockClient.getUserIdByMobile.mockRejectedValue(
        new Error('DingTalk gettoken failed: 缺少参数 corpid or appkey (errcode: 40035)')
      );

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138000',
        '张三'
      );

      expect(result.verified).toBe(false);
      expect(result.failure).toBe('credential_missing');
      expect(result.reason).toContain('凭据');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, detail] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(message).toContain('DingTalk phone lookup failed');
      expect(String(detail['error'])).toContain('40035');
      warnSpy.mockRestore();
    });

    /**
     * @test REQ-TBD-05
     * @intent 通讯录权限不足（60011 / errcode 88）单独归类为 permission_denied
     */
    it('classifies an insufficient-scope error as permission_denied', async () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mockClient.getUserIdByMobile.mockRejectedValue(
        new Error(
          'ding talk error[subcode=60011] requiredScopes=[qyapi_get_member_by_mobile] (errcode: 88)'
        )
      );

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138000',
        '张三'
      );

      expect(result.failure).toBe('permission_denied');
      expect(result.reason).toContain('权限');
      vi.restoreAllMocks();
    });

    it('classifies a transport failure as network_error', async () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mockClient.getUserIdByMobile.mockRejectedValue(new Error('fetch failed'));

      const result = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800138000',
        '张三'
      );

      expect(result.failure).toBe('network_error');
      vi.restoreAllMocks();
    });

    /**
     * @test REQ-TBD-05
     * @intent 日志中的手机号必须脱敏，且不得出现原始号码
     */
    it('never logs the raw phone number', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mockClient.getUserIdByMobile.mockRejectedValue(new Error('boom'));

      await verifyPhoneToName(mockClient as unknown as DingTalkClient, '13812345678', '张三');

      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain('13812345678');
      expect(logged).toContain('138****5678');
      warnSpy.mockRestore();
    });

    it('tags the not-found and mismatch cases with a failure class too', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({ found: false });
      const notFound = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800000000',
        '张三'
      );
      expect(notFound.failure).toBe('phone_not_found');

      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'u1',
        name: '张三',
      });
      const mismatch = await verifyPhoneToName(
        mockClient as unknown as DingTalkClient,
        '13800000000',
        '李四'
      );
      expect(mismatch.failure).toBe('name_mismatch');
    });
  });

  describe('name comparison handling', () => {
    /**
     * @test REQ-TBD-04
     * @intent 钉钉返回姓名为空 — 无法校验时必须拒绝，不得静默放行（issue #199）
     */
    it('should return verified=false when DingTalk returns no name', async () => {
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

      // A missing name used to fall through to verified:true, which made the
      // whole phone+name check a no-op for any input. It must refuse instead:
      // we cannot confirm the person, so we cannot admit them.
      expect(result.verified).toBe(false);
      expect(result.failure).toBe('name_unverifiable');
      expect(result.userId).toBe('user_no_name');
      expect(result.reason).toContain('无法校验');
    });

    it('rejects any name when DingTalk returns no name, not just mismatches', async () => {
      mockClient.getUserIdByMobile.mockResolvedValue({
        found: true,
        userId: 'user_no_name',
        name: '',
      });

      // Both a wrong name and the "right-looking" one must be refused, since
      // there is nothing to compare against.
      for (const name of ['完全不匹配的姓名', '张三']) {
        const result = await verifyPhoneToName(
          mockClient as unknown as DingTalkClient,
          '13800138003',
          name
        );
        expect(result.verified).toBe(false);
      }
    });
  });
});
