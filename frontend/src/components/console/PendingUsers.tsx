import React, { useState, useEffect } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from '@/components/ui/empty';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose
} from '@/components/ui/alert-dialog';
import { showToast } from '@/components/ui/toast';
import { CheckCircle } from '@/components/icon/CheckCircle';
import { XCircle, Inbox } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import axios from 'axios';

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
  const [approveDialogOpen, setApproveDialogOpen] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState<string | null>(null);

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
      showToast({
        title: '加载待审核用户失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      const response = await axios.post('/api/approve-user', { user_id: userId });
      if (response.data.success) {
        showToast({
          title: '用户已通过审核',
          type: 'success',
        });
        setApproveDialogOpen(null);
        loadPendingUsers();
      } else {
        showToast({
          title: response.data.message,
          type: 'error',
        });
      }
    } catch (error) {
      showToast({
        title: '操作失败',
        type: 'error',
      });
    }
  };

  const handleReject = async (userId: string) => {
    try {
      const response = await axios.post('/api/reject-user', { user_id: userId });
      if (response.data.success) {
        showToast({
          title: '用户已拒绝',
          type: 'success',
        });
        setRejectDialogOpen(null);
        loadPendingUsers();
      } else {
        showToast({
          title: response.data.message,
          type: 'error',
        });
      }
    } catch (error) {
      showToast({
        title: '操作失败',
        type: 'error',
      });
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <h4 className="text-xl font-semibold">待审核用户</h4>
        </div>
        <div className="flex justify-center items-center py-12">
          <Spinner />
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h4 className="text-xl font-semibold">待审核用户</h4>
      </div>

      {users.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox className="w-6 h-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>暂无待审核用户</EmptyTitle>
            <EmptyDescription>所有注册申请都已处理完毕</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>头像</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.avatar ? '已设置' : '未设置'}</TableCell>
                <TableCell>{new Date(user.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <AlertDialog open={approveDialogOpen === user.id} onOpenChange={(open) => setApproveDialogOpen(open ? user.id : null)}>
                      <AlertDialogTrigger>
                        <Button
                          variant="default"
                          size="sm"
                        >
                          <CheckCircle size={16} className="mr-1" />
                          通过
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogPopup>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认通过</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要通过该用户的注册申请吗？
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogClose>
                            <Button variant="outline">取消</Button>
                          </AlertDialogClose>
                          <Button
                            variant="default"
                            onClick={() => handleApprove(user.id)}
                          >
                            确认
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogPopup>
                    </AlertDialog>

                    <AlertDialog open={rejectDialogOpen === user.id} onOpenChange={(open) => setRejectDialogOpen(open ? user.id : null)}>
                      <AlertDialogTrigger>
                        <Button
                          variant="destructive"
                          size="sm"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          拒绝
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogPopup>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认拒绝</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要拒绝该用户的注册申请吗？该用户的邮箱将被加入黑名单。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogClose>
                            <Button variant="outline">取消</Button>
                          </AlertDialogClose>
                          <Button
                            variant="destructive"
                            onClick={() => handleReject(user.id)}
                          >
                            确认
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogPopup>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
};

export default PendingUsers;
