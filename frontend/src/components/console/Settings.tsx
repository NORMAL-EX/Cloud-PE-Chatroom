import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { showToast } from '@/components/ui/toast';
import axios from 'axios';

interface SystemSettings {
  registration_open: boolean;
  require_approval: boolean;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/settings');
      if (response.data.success) {
        setSettings(response.data.data);
      }
    } catch (error) {
      showToast({
        title: '加载设置失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = async (field: keyof SystemSettings, value: boolean) => {
    if (!settings) return;

    const newSettings = { ...settings, [field]: value };
    setSettings(newSettings);

    // 如果关闭了开放注册，同时关闭审核选项
    if (field === 'registration_open' && !value && newSettings.require_approval) {
      newSettings.require_approval = false;
      setSettings(newSettings);
    }

    // 自动保存
    setSaving(true);
    try {
      const response = await axios.post('/api/update-settings', newSettings);
      if (response.data.success) {
        showToast({
          title: '设置已保存',
          type: 'success',
        });
      } else {
        showToast({
          title: response.data.message,
          type: 'error',
        });
        // 恢复原设置
        loadSettings();
      }
    } catch (error) {
      showToast({
        title: '保存失败',
        type: 'error',
      });
      // 恢复原设置
      loadSettings();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spinner className="w-8 h-8" />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>系统设置</h4>
      </div>

      {settings && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>开放注册</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground, #6b7280)' }}>
                    关闭后，新用户将无法注册
                  </span>
                </div>
              </div>
              <Switch
                checked={settings.registration_open}
                onCheckedChange={(checked) => handleSettingChange('registration_open', checked)}
                disabled={saving}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>注册需要审核</span>
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground, #6b7280)' }}>
                    开启后，新用户注册后需要管理员审核才能登录
                  </span>
                </div>
              </div>
              <Switch
                checked={settings.require_approval}
                onCheckedChange={(checked) => handleSettingChange('require_approval', checked)}
                disabled={!settings.registration_open || saving}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Settings;
