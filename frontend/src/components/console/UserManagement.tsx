import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Typography, 
  Card, 
  Modal, 
  Form, 
  Toast, 
  Tag,
  Popconfirm,
  Input,
  Dropdown
} from '@douyinfe/semi-ui';
import { IconUserAdd, IconSearch, IconMore } from '@douyinfe/semi-icons';
import axios from 'axios';

const { Title } = Typography;

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  role: 'Admin' | 'DeputyAdmin' | 'Member';
  status: 'Active' | 'Pending' | 'Banned';
  created_at: string;
  last_ips: string[];
  muted_until?: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      Toast.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (values: any) => {
    setAddLoading(true);
    try {
      const response = await axios.post('/api/add-user', values);
      if (response.data.success) {
        Toast.success('用户添加成功');
        setAddModalVisible(false);
        loadUsers();
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('添加失败');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await axios.post('/api/delete-user', { user_id: userId });
      if (response.data.success) {
        Toast.success('用户已删除');
        loadUsers();
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('删除失败');
    }
  };

  const handleSetDeputyAdmin = async (userId: string, isDeputy: boolean) => {
    try {
      const response = await axios.post('/api/set-deputy-admin', { 
        user_id: userId,
        is_deputy: isDeputy 
      });
      if (response.data.success) {
        Toast.success(isDeputy ? '已设为次管理员' : '已取消次管理员');
        loadUsers();
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('操作失败');
    }
  };

  // 先过滤，再排序
  const filteredUsers = users
    .filter(user => 
      user.username.toLowerCase().includes(searchText.toLowerCase()) ||
      user.email.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      // 定义角色优先级
      const roleOrder = { 'Admin': 0, 'DeputyAdmin': 1, 'Member': 2 };
      
      // 按角色排序
      const roleCompare = roleOrder[a.role] - roleOrder[b.role];
      if (roleCompare !== 0) return roleCompare;
      
      // 如果角色相同，按注册时间排序（新的在前）
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: User) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {username}
          {record.role === 'Admin' && <Tag size="small" style={{ backgroundColor: 'var(--admin-tag-background)', color: 'var(--admin-tag-color)', borderColor: 'var(--admin-tag-background)' }}>管理员</Tag>}
          {record.role === 'DeputyAdmin' && <Tag color="green">次管理员</Tag>}
        </div>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (_: string, record: User) => {
        if (record.muted_until && new Date(record.muted_until) > new Date()) {
          const remaining = Math.ceil((new Date(record.muted_until).getTime() - Date.now()) / 1000 / 60);
          return <Tag color="yellow">禁言中 ({remaining}分钟)</Tag>;
        }
        return <Tag color="green">正常</Tag>;
      },
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '最近IP',
      dataIndex: 'last_ips',
      key: 'last_ips',
      render: (ips: string[]) => ips.length > 0 ? ips[ips.length - 1] : '无记录',
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: User) => (
        <div style={{ display: 'flex', gap: 8 }}>
          {record.role !== 'Admin' && (
            <Dropdown
              trigger="click"
              position="bottomRight"
              render={
                <Dropdown.Menu>
                  {record.role === 'Member' && (
                    <Dropdown.Item onClick={() => handleSetDeputyAdmin(record.id, true)}>
                      设为次管理员
                    </Dropdown.Item>
                  )}
                  {record.role === 'DeputyAdmin' && (
                    <Dropdown.Item onClick={() => handleSetDeputyAdmin(record.id, false)}>
                      取消次管理员
                    </Dropdown.Item>
                  )}
                  <Dropdown.Divider />
                  <Popconfirm
                    title="确认删除"
                    content={`确定要删除用户 ${record.username} 吗？`}
                    onConfirm={() => handleDeleteUser(record.id)}
                  >
                    <Dropdown.Item type="danger">
                      删除用户
                    </Dropdown.Item>
                  </Popconfirm>
                </Dropdown.Menu>
              }
            >
              <Button
                theme="borderless"
                icon={<IconMore />}
                size="small"
              />
            </Dropdown>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title heading={4}>用户管理</Title>
        <div style={{ display: 'flex', gap: 12 }}>
          <Input
            prefix={<IconSearch />}
            placeholder="搜索用户名或邮箱"
            value={searchText}
            onChange={setSearchText}
            style={{ width: 240 }}
          />
          <Button
            theme="solid"
            type="primary"
            icon={<IconUserAdd />}
            onClick={() => setAddModalVisible(true)}
          >
            添加用户
          </Button>
        </div>
      </div>
      
      <Table
        columns={columns}
        dataSource={filteredUsers}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
        }}
      />

      <Modal
        title="添加用户"
        visible={addModalVisible}
        onCancel={() => setAddModalVisible(false)}
        footer={null}
        bodyStyle={{ padding: '24px' }}
      >
        <Form onSubmit={handleAddUser}>
          <Form.Input
            field="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
            placeholder="请输入用户名"
          />
          <Form.Input
            field="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
            placeholder="请输入邮箱"
          />
          <Form.Input
            field="password"
            label="密码"
            type="password"
            rules={[{ required: true, message: '请输入密码' }]}
            placeholder="请输入密码"
          />
          <Form.Input
            field="avatar"
            label="头像链接"
            placeholder="请输入头像链接（选填）"
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            marginTop: 24,
            gap: 12,
            paddingTop: 16
          }}>
            <Button
              type="tertiary"
              onClick={() => setAddModalVisible(false)}
            >
              取消
            </Button>
            <Button
              theme="solid"
              type="primary"
              htmlType="submit"
              loading={addLoading}
            >
              添加
            </Button>
          </div>
        </Form>
      </Modal>
    </Card>
  );
};

export default UserManagement;