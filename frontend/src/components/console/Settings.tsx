import React, { useState, useEffect } from 'react';
import { Switch, Typography, Toast, Spin } from '@douyinfe/semi-ui';
import axios from 'axios';

const { Title, Text } = Typography;

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
      Toast.error('加载设置失败');
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
        Toast.success('设置已保存');
      } else {
        Toast.error(response.data.message);
        // 恢复原设置
        loadSettings();
      }
    } catch (error) {
      Toast.error('保存失败');
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
          <Spin size="large" />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Title heading={4}>系统设置</Title>
      </div>
      
      {settings && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text strong style={{ fontSize: 14 }}>开放注册</Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="tertiary" size="small">关闭后，新用户将无法注册</Text>
                </div>
              </div>
              <Switch
                checked={settings.registration_open}
                onChange={(checked) => handleSettingChange('registration_open', checked)}
                loading={saving}
              />
            </div>
          </div>
          
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text strong style={{ fontSize: 14 }}>注册需要审核</Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="tertiary" size="small">开启后，新用户注册后需要管理员审核才能登录</Text>
                </div>
              </div>
              <Switch
                checked={settings.require_approval}
                onChange={(checked) => handleSettingChange('require_approval', checked)}
                disabled={!settings.registration_open || saving}
                loading={saving}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Settings;