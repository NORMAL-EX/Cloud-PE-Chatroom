import React, { useState, useEffect } from 'react';
import { Table, Button, Typography, Card, Empty, Toast, Popconfirm } from '@douyinfe/semi-ui';
import { IconCheckCircleStroked, IconMinusCircle, IconInbox } from '@douyinfe/semi-icons';
import axios from 'axios';

const { Title } = Typography;

interface PendingUser {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  created_at: string;
}

const PendingUsers: React.FC = () => {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingUsers();
  }, []);

  const loadPendingUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/pending-users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      Toast.error('加载待审核用户失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      const response = await axios.post('/api/approve-user', { user_id: userId });
      if (response.data.success) {
        Toast.success('用户已通过审核');
        loadPendingUsers();
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('操作失败');
    }
  };

  const handleReject = async (userId: string) => {
    try {
      const response = await axios.post('/api/reject-user', { user_id: userId });
      if (response.data.success) {
        Toast.success('用户已拒绝');
        loadPendingUsers();
      } else {
        Toast.error(response.data.message);
      }
    } catch (error) {
      Toast.error('操作失败');
    }
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '头像',
      dataIndex: 'avatar',
      key: 'avatar',
      render: (avatar: string) => avatar ? '已设置' : '未设置',
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: PendingUser) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Popconfirm
            title="确认通过"
            content="确定要通过该用户的注册申请吗？"
            onConfirm={() => handleApprove(record.id)}
          >
            <Button
              type="primary"
              theme="solid"
              icon={<IconCheckCircleStroked />}
              size="small"
            >
              通过
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认拒绝"
            content="确定要拒绝该用户的注册申请吗？该用户的邮箱将被加入黑名单。"
            onConfirm={() => handleReject(record.id)}
          >
            <Button
              type="danger"
              theme="solid"
              icon={<IconMinusCircle />}
              size="small"
            >
              拒绝
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ marginBottom: 16 }}>
        <Title heading={4}>待审核用户</Title>
      </div>
      
      {users.length === 0 && !loading ? (
        <Empty
          image= {<IconInbox style={{ fontSize: 50 }}/>}
          title="暂无待审核用户"
          description="所有注册申请都已处理完毕"
        />
      ) : (
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      )}
    </Card>
  );
};

export default PendingUsers;