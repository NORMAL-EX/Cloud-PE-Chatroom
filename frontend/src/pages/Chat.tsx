import React, { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Send, Copy, ArrowUp, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { toastManager } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import { AlertDialog, AlertDialogPopup, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { NumberField, NumberFieldInput } from '@/components/ui/number-field';
import { Label } from '@/components/ui/label';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import './Chat.css';

interface Message {
  id: string;
  user_id: string;
  content: string;
  timestamp: string;
  recalled: boolean;
  original_content?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    avatar?: string;
    display_name?: string;
    role: 'Admin' | 'DeputyAdmin' | 'Member';
    muted_until?: string;
  };
}

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  display_name?: string;
  role: 'Admin' | 'DeputyAdmin' | 'Member';
  muted_until?: string;
}

interface MentionItem {
  messageId: string;
  from: string;
  content: string;
  timestamp: string;
}

interface MentionPosition {
  top?: number;
  bottom?: number;
  left: number;
}

const Chat: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customMuteModalVisible, setCustomMuteModalVisible] = useState(false);
  const [muteTargetUser, setMuteTargetUser] = useState<string>('');
  const [customMuteDuration, setCustomMuteDuration] = useState<number>(10);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState<MentionPosition>({ left: 0 });
  const [myMentions, setMyMentions] = useState<MentionItem[]>([]);
  const [showMentionAlert, setShowMentionAlert] = useState(false);
  const [checkedMentionIds, setCheckedMentionIds] = useState<Set<string>>(new Set());
  const [currentMentionIndex, setCurrentMentionIndex] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [viewOriginalMessages, setViewOriginalMessages] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [tempDisplayName, setTempDisplayName] = useState('');
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const lastScrollDirection = useRef<'up' | 'down'>('down');
  const lastScrollTop = useRef(0);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    
    document.addEventListener('contextmenu', handleContextMenu);
    
    loadMessages();
    loadUsers();
    loadCurrentUser();
    loadMentionChecks();
    connectWebSocket();

    const interval = setInterval(() => {
      loadCurrentUser();
    }, 10000);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (user && messages.length > 0) {
      const mentions: MentionItem[] = [];
      const myDisplayName = currentUser?.display_name || user.username;
      
      messages.forEach(msg => {
        const specialMentionRegex = new RegExp(`@\\[${user.id}:[^\\]]+\\]`, 'g');
        const normalMentionRegex1 = new RegExp(`@${myDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
        const normalMentionRegex2 = new RegExp(`@${user.username.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?!\\w)`, 'g');
        
        if (!msg.recalled && msg.user_id !== user.id && 
            (specialMentionRegex.test(msg.content) || 
             normalMentionRegex1.test(msg.content) || 
             normalMentionRegex2.test(msg.content))) {
          const messageUser = getUserInfo(msg.user_id);
          mentions.push({
            messageId: msg.id,
            from: getDisplayName(messageUser),
            content: msg.content,
            timestamp: msg.timestamp
          });
        }
      });
      
      setMyMentions(mentions);
      
      const uncheckedMentions = mentions.filter(m => !checkedMentionIds.has(m.messageId));
      
      if (uncheckedMentions.length > 0) {
        setShowMentionAlert(true);
        setCurrentMentionIndex(0);
      } else {
        setShowMentionAlert(false);
      }
    }
  }, [messages, user, currentUser, checkedMentionIds]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const isAtBottom = scrollHeight - currentScrollTop - clientHeight < 50;

      if (currentScrollTop < lastScrollTop.current) {
        lastScrollDirection.current = 'up';
      } else if (currentScrollTop > lastScrollTop.current) {
        lastScrollDirection.current = 'down';
      }
      lastScrollTop.current = currentScrollTop;

      if (lastScrollDirection.current === 'down' && !isAtBottom && currentScrollTop > 100) {
        setShowScrollToBottom(true);
      } else if (isAtBottom) {
        setShowScrollToBottom(false);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const loadMessages = async () => {
    try {
      const response = await axios.get('/api/messages');
      if (response.data.success) {
        setMessages(response.data.data);
      }
    } catch (error) {
      toastManager.add({ title: '加载消息失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
    }
  };

  const loadCurrentUser = async () => {
    try {
      const response = await axios.get('/api/current-user');
      if (response.data.success) {
        setCurrentUser(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load current user');
    }
  };

  const loadMentionChecks = async () => {
    try {
      const response = await axios.get('/api/mention-checks');
      if (response.data.success && response.data.data) {
        setCheckedMentionIds(new Set(response.data.data));
      }
    } catch (error) {
      console.error('Failed to load mention checks');
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.event) {
          case 'new_message':
            setMessages(prev => [...prev, data.data]);
            break;
          case 'message_recalled':
            setMessages(prev => prev.map(msg => 
              msg.id === data.data.message_id 
                ? { ...msg, recalled: true }
                : msg
            ));
            setViewOriginalMessages(prev => {
              const newSet = new Set(prev);
              newSet.delete(data.data.message_id);
              return newSet;
            });
            break;
          case 'message_recalled_with_data':
            setMessages(prev => prev.map(msg => 
              msg.id === data.data.id 
                ? data.data
                : msg
            ));
            setViewOriginalMessages(prev => {
              const newSet = new Set(prev);
              newSet.delete(data.data.id);
              return newSet;
            });
            break;
          case 'user_banned':
            if (data.data.user_id === user?.id) {
              toastManager.add({ title: '您已被封禁', type: 'error' });
              logout();
            }
            break;
          case 'user_deleted':
            if (data.data.user_id === user?.id) {
              toastManager.add({ title: '您的账号已被删除', type: 'error' });
              logout();
            }
            break;
          case 'role_changed':
            loadUsers();
            if (data.data.user_id === user?.id) {
              loadCurrentUser();
              if (data.data.new_role === 'DeputyAdmin') {
                toastManager.add({ title: '您已被设为次管理员', type: 'success' });
              } else if (data.data.old_role === 'DeputyAdmin' && data.data.new_role === 'Member') {
                toastManager.add({ title: '您的次管理员权限已被取消', type: 'info' });
              }
            }
            loadMessages();
            break;
          case 'display_name_changed':
            loadMessages();
            loadUsers();
            if (data.data.user_id === user?.id) {
              loadCurrentUser();
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, 3000);
    };

    wsRef.current = ws;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollToBottom(false);
  };

  const scrollToMessage = (messageId: string) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageElement.classList.add('message-highlight');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight');
      }, 2000);
    }
  };

  const handleViewMentions = async () => {
    const uncheckedMentions = myMentions.filter(m => !checkedMentionIds.has(m.messageId));
    
    if (uncheckedMentions.length > 0 && currentMentionIndex < uncheckedMentions.length) {
      const currentMention = uncheckedMentions[currentMentionIndex];
      
      scrollToMessage(currentMention.messageId);
      
      try {
        const response = await axios.post('/api/mark-mentions-checked', {
          message_ids: [currentMention.messageId]
        });
        
        if (response.data.success) {
          const newCheckedIds = new Set(checkedMentionIds);
          newCheckedIds.add(currentMention.messageId);
          setCheckedMentionIds(newCheckedIds);
          
          setCurrentMentionIndex(currentMentionIndex + 1);
          
          if (currentMentionIndex + 1 >= uncheckedMentions.length) {
            setShowMentionAlert(false);
            setCurrentMentionIndex(0);
          }
        }
      } catch (error) {
        console.error('Failed to mark mention as checked');
      }
    }
  };

  const processMessageContent = (content: string): string => {
    let processedContent = content;
    const allUsers = getAllUsers();
    
    const mentionRegex = /@([^\s@]+)/g;
    
    processedContent = processedContent.replace(mentionRegex, (match, mentionedName) => {
      const matchedUser = allUsers.find(u => 
        (u.display_name && u.display_name === mentionedName) || 
        u.username === mentionedName
      );
      
      if (matchedUser) {
        const displayName = getDisplayName(matchedUser);
        return `@[${matchedUser.id}:${displayName}]`;
      }
      
      return match;
    });
    
    return processedContent;
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    setSending(true);
    try {
      const processedContent = processMessageContent(input);
      
      const response = await axios.post('/api/send-message', { content: processedContent });
      if (response.data.success) {
        setInput('');
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '发送失败', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const recallMessage = async (messageId: string) => {
    try {
      const response = await axios.post('/api/recall-message', { message_id: messageId });
      if (!response.data.success) {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '撤回失败', type: 'error' });
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      toastManager.add({ title: '已复制到剪贴板', type: 'success' });
    }).catch(() => {
      toastManager.add({ title: '复制失败', type: 'error' });
    });
  };

  const handleUserAction = async (targetUserId: string, action: string) => {
    if (action === 'muteCustom') {
      setMuteTargetUser(targetUserId);
      setCustomMuteModalVisible(true);
      return;
    }

    try {
      let response;
      switch (action) {
        case 'setDeputy':
          response = await axios.post('/api/set-deputy-admin', { 
            user_id: targetUserId, 
            is_deputy: true 
          });
          break;
        case 'removeDeputy':
          response = await axios.post('/api/set-deputy-admin', { 
            user_id: targetUserId, 
            is_deputy: false 
          });
          break;
        case 'mute10':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 10 
          });
          break;
        case 'mute60':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 60 
          });
          break;
        case 'mute1440':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 1440 
          });
          break;
        case 'mute43200':
          response = await axios.post('/api/mute-user', { 
            user_id: targetUserId, 
            duration_minutes: 43200 
          });
          break;
        case 'unmute':
          response = await axios.post('/api/unmute-user', { 
            user_id: targetUserId
          });
          break;
        case 'ban':
          if (window.confirm('确定要封禁该用户吗？封禁后用户将被删除且邮箱将被加入黑名单。')) {
            response = await axios.post('/api/ban-user', { user_id: targetUserId });
            if (response?.data.success) {
              toastManager.add({ title: '用户已封禁', type: 'success' });
              loadUsers();
              loadMessages();
            } else {
              toastManager.add({ title: response?.data.message || '操作失败', type: 'error' });
            }
          }
          return;
        case 'delete':
          if (window.confirm('确定要删除该用户吗？')) {
            response = await axios.post('/api/delete-user', { user_id: targetUserId });
            if (response?.data.success) {
              toastManager.add({ title: '用户已删除', type: 'success' });
              loadUsers();
              loadMessages();
            } else {
              toastManager.add({ title: response?.data.message || '操作失败', type: 'error' });
            }
          }
          return;
      }

      if (response?.data.success) {
        toastManager.add({ title: '操作成功', type: 'success' });
        loadUsers();
        loadMessages();
        if (action.startsWith('mute') || action === 'unmute') {
          setTimeout(() => loadCurrentUser(), 500);
        }
      } else {
        toastManager.add({ title: response?.data.message || '操作失败', type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '操作失败', type: 'error' });
    }
  };

  const handleCustomMute = async () => {
    try {
      const response = await axios.post('/api/mute-user', { 
        user_id: muteTargetUser, 
        duration_minutes: customMuteDuration 
      });
      
      if (response.data.success) {
        toastManager.add({ title: '操作成功', type: 'success' });
        setCustomMuteModalVisible(false);
        loadUsers();
        loadMessages();
        setTimeout(() => loadCurrentUser(), 500);
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '操作失败', type: 'error' });
    }
  };

  const getUserInfo = (userId: string): User | null => {
    const userFromList = users.find((u: User) => u.id === userId);
    if (userFromList) return userFromList;
    
    if (currentUser?.id === userId) return currentUser;
    if (user?.id === userId) return user as User;
    
    const messageWithUser = messages.find((msg: Message) => msg.user_id === userId && msg.user);
    if (messageWithUser?.user) return messageWithUser.user as User;
    
    return null;
  };

  const getAllUsers = (): User[] => {
    const userMap = new Map<string, User>();
    
    users.forEach(u => userMap.set(u.id, u));
    
    if (currentUser) userMap.set(currentUser.id, currentUser);
    if (user && !userMap.has(user.id)) userMap.set(user.id, user as User);
    
    messages.forEach(msg => {
      if (msg.user && !userMap.has(msg.user.id)) {
        userMap.set(msg.user.id, msg.user as User);
      }
    });
    
    return Array.from(userMap.values());
  };

  const getAvatar = (userInfo: User | null) => {
    if (userInfo?.avatar) {
      return (
        <Avatar className="w-8 h-8 flex-shrink-0">
          <img src={userInfo.avatar} alt={userInfo.username} />
        </Avatar>
      );
    }
    
    const name = userInfo?.username || '?';
    const firstChar = name[0].toUpperCase();
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
    ];
    const colorIndex = name.charCodeAt(0) % colors.length;
    
    return (
      <Avatar className={`w-8 h-8 flex-shrink-0 ${colors[colorIndex]} text-white`}>
        {firstChar}
      </Avatar>
    );
  };

  const canManageUser = (targetUser: User | null) => {
    if (!user || !targetUser) return false;
    
    if (user.id === targetUser.id) return false;
    
    if (user.role === 'Admin') return true;
    
    if (user.role === 'DeputyAdmin' && targetUser.role === 'Member') return true;
    
    return false;
  };

  const canEditDisplayName = (targetUser: User | null) => {
    if (!user || !targetUser) return false;
    
    if (user.id === targetUser.id) return true;
    
    if (user.role === 'Admin' && (targetUser.role === 'DeputyAdmin' || targetUser.role === 'Member')) return true;
    
    if (user.role === 'DeputyAdmin' && targetUser.role === 'Member') return true;
    
    return false;
  };

  const getMutedInfo = () => {
    if (!currentUser?.muted_until) return null;
    
    const mutedUntil = new Date(currentUser.muted_until);
    const now = new Date();
    
    if (mutedUntil <= now) return null;
    
    const diffMs = mutedUntil.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / 60000);
    
    if (diffMins > 60) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `您已被禁言，剩余时间：${hours}小时${mins}分钟`;
    }
    
    return `您已被禁言，剩余时间：${diffMins}分钟`;
  };

  const isMuted = () => {
    if (!currentUser?.muted_until) return false;
    return new Date(currentUser.muted_until) > new Date();
  };

  const isUserMuted = (targetUser: User | null) => {
    if (!targetUser?.muted_until) return false;
    return new Date(targetUser.muted_until) > new Date();
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      
      if (!textAfterAt.includes(' ')) {
        setMentionSearch(textAfterAt.toLowerCase());
        setShowMentionList(true);
        
        setMentionPosition({
          bottom: 50,
          left: 0
        });
      } else {
        setShowMentionList(false);
      }
    } else {
      setShowMentionList(false);
    }
  };

  const handleSelectMention = (selectedUser: User) => {
    const lastAtIndex = input.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const beforeAt = input.substring(0, lastAtIndex);
      const afterAt = input.substring(lastAtIndex + 1);
      
      const spaceIndex = afterAt.indexOf(' ');
      const restText = spaceIndex !== -1 ? afterAt.substring(spaceIndex) : '';
      
      const displayName = getDisplayName(selectedUser);
      setInput(`${beforeAt}@${displayName} ${restText}`);
      setShowMentionList(false);
      
      if (textAreaRef.current) {
        textAreaRef.current.focus();
      }
    }
  };

  const getDisplayName = (userInfo: User | null): string => {
    if (!userInfo) return 'Unknown';
    return userInfo.display_name || userInfo.username;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleUpdateDisplayName = async (userId: string) => {
    try {
      const newDisplayName = tempDisplayName.trim() || null;
      const response = await axios.post('/api/update-user-display-name', {
        user_id: userId,
        display_name: newDisplayName
      });
      
      if (response.data.success) {
        toastManager.add({ title: '昵称已更新', type: 'success' });
        setEditingMessageId(null);
        loadCurrentUser();
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '更新失败', type: 'error' });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await axios.post('/api/delete-account');
      if (response.data.success) {
        toastManager.add({ title: '账号已注销', type: 'success' });
        logout();
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error) {
      toastManager.add({ title: '操作失败', type: 'error' });
    }
  };

  const renderMessageContent = (content: string) => {
    let processedContent = content;
    
    const specialMentionRegex = /@\[([^:]+):([^\]]+)\]/g;
    processedContent = processedContent.replace(specialMentionRegex, (_match, userId, oldDisplayName) => {
      const user = getUserInfo(userId);
      if (user) {
        return `@${getDisplayName(user)}`;
      }
      return `@${oldDisplayName}`;
    });
    
    const htmlTagRegex = /<(?!https?:\/\/)[^>]+>/;
    const hasHtmlTags = htmlTagRegex.test(processedContent);
    
    if (hasHtmlTags) {
      const allUsers = getAllUsers();
      allUsers.forEach(u => {
        const displayName = u.display_name || u.username;
        const username = u.username;
        
        const displayNameRegex = new RegExp(`@${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
        processedContent = processedContent.replace(displayNameRegex, `<span class="mention-highlight">@${displayName}</span>`);
        
        if (displayName !== username) {
          const usernameRegex = new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g');
          processedContent = processedContent.replace(usernameRegex, `<span class="mention-highlight">@${displayName}</span>`);
        }
      });
      
      const config = {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                       'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
                       'font', 'center', 'hr', 'sub', 'sup', 'u', 's', 'del', 'ins', 'mark', 'small', 'big'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'id', 'target', 'rel', 'width', 'height', 'color', 'size', 'face', 'align'],
        ALLOWED_CLASSES: {
          'span': ['mention-highlight']
        },
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave']
      };
      
      const sanitizedContent = DOMPurify.sanitize(processedContent, config);
      
      return (
        <div 
          className="message-html-content"
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />
      );
    } else {
      return (
        <div className="message-html-content">
          <ReactMarkdown
            components={{
              p: ({ children }) => {
                const processChildren = (children: React.ReactNode): React.ReactNode => {
                  return React.Children.map(children, (child, index) => {
                    if (typeof child === 'string') {
                      const parts: React.ReactNode[] = [];
                      let lastIndex = 0;
                      const allUsers = getAllUsers();
                      
                      const mentionRegex = /@([^\s@]+)/g;
                      let match;
                      
                      while ((match = mentionRegex.exec(child)) !== null) {
                        const mentionedName = match[1];
                        
                        const matchedUser = allUsers.find(u => 
                          (u.display_name && u.display_name === mentionedName) || 
                          u.username === mentionedName
                        );
                        
                        if (matchedUser) {
                          if (match.index > lastIndex) {
                            parts.push(child.substring(lastIndex, match.index));
                          }
                          
                          const displayName = getDisplayName(matchedUser);
                          parts.push(
                            <span key={`mention-${index}-${match.index}`} className="mention-highlight">
                              @{displayName}
                            </span>
                          );
                          
                          lastIndex = match.index + match[0].length;
                        }
                      }
                      
                      if (lastIndex < child.length) {
                        parts.push(child.substring(lastIndex));
                      }
                      
                      return parts.length > 0 ? parts : child;
                    }
                    return child;
                  });
                };
                
                return <p style={{ margin: '4px 0' }}>{processChildren(children)}</p>;
              },
              code: ({ children, className }) => {
                const text = String(children || '');
                const isCodeBlock = className && className.startsWith('language-');
                if (isCodeBlock) {
                  return <pre><code className={className}>{text}</code></pre>;
                }
                return <code>{text}</code>;
              },
              pre: ({ children }) => {
                return <pre style={{ margin: '8px 0' }}>{children}</pre>;
              },
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      );
    }
  };

  const toggleViewOriginal = (messageId: string) => {
    setViewOriginalMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const filteredUsers = getAllUsers().filter(u => {
    if (u.id === user?.id) return false;
    const searchLower = mentionSearch.toLowerCase();
    const displayName = getDisplayName(u).toLowerCase();
    const username = u.username.toLowerCase();
    return displayName.startsWith(searchLower) || username.startsWith(searchLower);
  });

  const uncheckedMentionsCount = myMentions.filter(m => !checkedMentionIds.has(m.messageId)).length;

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <div className="header-left">
          <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" className="header-logo" />
          <h4 className="text-lg font-semibold m-0">Cloud-PE 项目交流群</h4>
        </div>
        <div className="header-right">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
          <Menu>
            <MenuTrigger render={<button className="cursor-pointer">{getAvatar(user)}</button>} />
            <MenuPopup>
              <MenuItem disabled className="cursor-default font-semibold">
                {user?.username}
              </MenuItem>
              <MenuSeparator />
              {user?.role === 'Admin' && (
                <MenuItem onClick={() => window.open('/console', '_blank')}>
                  管理后台
                </MenuItem>
              )}
              {user?.role !== 'Admin' && (
                <MenuItem onClick={() => setDeleteAccountDialogOpen(true)}>注销账号</MenuItem>
              )}
              <MenuItem onClick={logout}>退出登录</MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </header>

      <main className="chat-content">
        <div className="messages-container" ref={messagesContainerRef}>
          {messages.map((message) => {
            const messageUser = getUserInfo(message.user_id);
            const isOwn = message.user_id === user?.id;
            const showOriginal = viewOriginalMessages.has(message.id);
            const isEditingThisMessage = editingMessageId === message.id;
            
            return (
              <div key={message.id} id={`message-${message.id}`} className={`message ${isOwn ? 'own' : ''}`}>
                <div className="message-header">
                  {canManageUser(messageUser) ? (
                    <Menu>
                      <MenuTrigger render={<button className="cursor-pointer">{getAvatar(messageUser)}</button>} />
                      <MenuPopup>
                        {user?.role === 'Admin' && messageUser && (
                          <>
                            {messageUser.role === 'Member' && (
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'setDeputy')}>
                                设为次管理员
                              </MenuItem>
                            )}
                            {messageUser.role === 'DeputyAdmin' && (
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'removeDeputy')}>
                                取消次管理员
                              </MenuItem>
                            )}
                          </>
                        )}
                        
                        {messageUser && (
                          isUserMuted(messageUser) ? (
                            <MenuItem onClick={() => handleUserAction(messageUser.id, 'unmute')}>
                              解除禁言
                            </MenuItem>
                          ) : (
                            <>
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'mute10')}>
                                禁言10分钟
                              </MenuItem>
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'mute60')}>
                                禁言1小时
                              </MenuItem>
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'mute1440')}>
                                禁言1天
                              </MenuItem>
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'mute43200')}>
                                禁言30天
                              </MenuItem>
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'muteCustom')}>
                                自定义时间
                              </MenuItem>
                            </>
                          )
                        )}
                        
                        <MenuSeparator />
                        
                        {messageUser && (
                          <>
                            <MenuItem onClick={() => handleUserAction(messageUser.id, 'ban')} className="text-destructive">
                              封禁
                            </MenuItem>
                            {user?.role === 'Admin' && (
                              <MenuItem onClick={() => handleUserAction(messageUser.id, 'delete')} className="text-destructive">
                                删除用户
                              </MenuItem>
                            )}
                          </>
                        )}
                      </MenuPopup>
                    </Menu>
                  ) : (
                    getAvatar(messageUser)
                  )}
                  {isEditingThisMessage ? (
                    <Input
                      defaultValue={messageUser?.display_name || messageUser?.username}
                      className="w-30 mx-2"
                      onChange={(e) => setTempDisplayName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleUpdateDisplayName(messageUser?.id || '');
                        }
                      }}
                      onBlur={() => {
                        setEditingMessageId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className={`message-username font-semibold ${canEditDisplayName(messageUser) ? 'cursor-pointer' : 'cursor-default'}`}
                      onDoubleClick={() => {
                        if (canEditDisplayName(messageUser)) {
                          setEditingMessageId(message.id);
                          setTempDisplayName(messageUser?.display_name || messageUser?.username || '');
                        }
                      }}
                    >
                      {getDisplayName(messageUser)}
                    </span>
                  )}
                  {messageUser?.role === 'Admin' && (
                    <Badge className="admin-tag">管理员</Badge>
                  )}
                  {messageUser?.role === 'DeputyAdmin' && (
                    <Badge variant="secondary">次管理员</Badge>
                  )}
                  {isUserMuted(messageUser) && (
                    <Badge variant="outline">已禁言</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(message.timestamp).toLocaleString()}
                  </span>
                </div>
                <Menu>
                  <MenuTrigger render={
                    <div className="message-content">
                      {message.recalled ? (
                        user?.role === 'Admin' && message.original_content ? (
                          <span className="text-muted-foreground">
                            原消息已被撤回{' '}
                            <span 
                              className="view-original-link"
                              onClick={() => toggleViewOriginal(message.id)}
                            >
                              {showOriginal ? '隐藏原消息' : '查看原消息'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">原消息已被撤回</span>
                        )
                      ) : null}
                      {!message.recalled || (message.recalled && showOriginal && message.original_content) ? (
                        <div className="message-text">
                          {renderMessageContent(
                            showOriginal && message.original_content ? message.original_content : message.content
                          )}
                        </div>
                      ) : null}
                    </div>
                  } />
                  <MenuPopup>
                    {(!message.recalled || (message.recalled && showOriginal && message.original_content)) && (
                      <MenuItem 
                        onClick={() => copyMessage(showOriginal && message.original_content ? message.original_content : message.content)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        复制
                      </MenuItem>
                    )}
                    
                    {!message.recalled && (message.user_id === user?.id || 
                      (user?.role === 'Admin') ||
                      (user?.role === 'DeputyAdmin' && messageUser?.role !== 'Admin')) && (
                      <>
                        <MenuSeparator />
                        <MenuItem onClick={() => recallMessage(message.id)}>
                          撤回
                        </MenuItem>
                      </>
                    )}
                  </MenuPopup>
                </Menu>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {showScrollToBottom && (
          <Button
            className="scroll-to-bottom-btn"
            size="icon"
            onClick={scrollToBottom}
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
        )}
      </main>

      <footer className="chat-footer">
        {showMentionAlert && uncheckedMentionsCount > 0 && (
          <div className="mb-2">
            <Button
              variant="outline"
              onClick={handleViewMentions}
              className="w-full"
            >
              <ArrowUp className="mr-2 h-4 w-4" />
              看看你被谁@了 ({uncheckedMentionsCount}条)
            </Button>
          </div>
        )}
        <div className="input-container relative">
          <Textarea
            ref={textAreaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getMutedInfo() || "输入消息... (支持HTML，Enter 发送，Shift+Enter 换行)"}
            disabled={sending || isMuted()}
            className="min-h-[40px] max-h-[120px] resize-none flex-1"
          />
          {showMentionList && (
            <div className="mention-list" style={{
              position: 'absolute',
              bottom: mentionPosition.bottom || 50,
              left: mentionPosition.left || 0,
            }}>
              {filteredUsers.length > 0 ? (
                filteredUsers.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 cursor-pointer hover:bg-accent"
                    onClick={() => handleSelectMention(item)}
                  >
                    {getAvatar(item)}
                    <span>{getDisplayName(item)}</span>
                  </div>
                ))
              ) : (
                <div className="p-2 text-muted-foreground">没有找到用户</div>
              )}
            </div>
          )}
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isMuted() || sending}
            size="lg"
            className="h-[40px]"
          >
            {sending ? <Spinner className="w-4 h-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {getMutedInfo() && (
          <div className="p-2 text-center">
            <span className="text-destructive">{getMutedInfo()}</span>
          </div>
        )}
        <div className="footer-info">
          <span className="text-sm text-muted-foreground">© 2025 Cloud-PE Team.</span>
          <span className="text-sm text-muted-foreground">
            <a 
              href="https://beian.miit.gov.cn/#/Integrated/index" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline"
            >
              鲁ICP备2023028944号
            </a>
          </span>
        </div>
      </footer>

      <Dialog open={customMuteModalVisible} onOpenChange={setCustomMuteModalVisible}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>自定义禁言时间</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="duration">禁言时长（分钟）</Label>
              <NumberField
                // @ts-ignore
                value={customMuteDuration}
                onValueChange={(val: any) => setCustomMuteDuration(val?.valueAsNumber ?? val ?? 10)}
                min={1}
                max={43200}
              >
                <NumberFieldInput id="duration" className="w-full" />
              </NumberField>
              <div className="mt-2 text-sm text-muted-foreground">
                <div>最少1分钟，最多30天（43200分钟）</div>
                <div>
                  当前设置：
                  {customMuteDuration >= 1440 
                    ? `${Math.floor(customMuteDuration / 1440)}天${customMuteDuration % 1440 ? `${Math.floor((customMuteDuration % 1440) / 60)}小时${customMuteDuration % 60}分钟` : ''}`
                    : customMuteDuration >= 60 
                      ? `${Math.floor(customMuteDuration / 60)}小时${customMuteDuration % 60 ? `${customMuteDuration % 60}分钟` : ''}`
                      : `${customMuteDuration}分钟`
                  }
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={handleCustomMute}>确定</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
        <AlertDialogPopup>
          <AlertDialogTitle>确认注销账号</AlertDialogTitle>
          <AlertDialogDescription>
            您确定要注销账号吗？注销后所有数据将被删除且无法恢复。
          </AlertDialogDescription>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount}>确认注销</AlertDialogAction>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
};

export default Chat;
