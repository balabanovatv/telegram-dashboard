import React, { useEffect, useState } from 'react';
import { Layout, Row, Col, Table, Button, Modal, List, DatePicker, Space, Spin, message, Card } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from './supabaseClient';
import dayjs from 'dayjs';

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;

function App() {
  const [metrics, setMetrics] = useState({
    totalMessages: 0,
    totalDialogs: 0,
    avgDialogLength: 0,
    retentionRate: '0%',
    successRate: '0%',
    failRate: '0%',
    conversion: '0%',
  });
  const [chartData, setChartData] = useState([]);
  const [users, setUsers] = useState([]);
  const [chatLogs, setChatLogs] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [dateRange, setDateRange] = useState([null, null]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      
      try {
        const { data: logs, error } = await supabase.from('chat_logs').select('*');
        
        if (error || !logs) {
          console.error('Ошибка Supabase:', error);
          setError('Ошибка загрузки данных из Supabase');
          setLoading(false);
          return;
        }

        if (!logs || logs.length === 0) {
          console.log('Нет данных');
          setLoading(false);
          return;
        }

        console.log('Загружено записей:', logs.length);

        // Расчёт метрик
        const totalMessages = logs.length;
        const validLogs = logs.filter(l => l.session_id && l.user_id);
        const sessions = Array.from(new Set(validLogs.map(l => l.session_id)));
        const totalDialogs = sessions.length;

        const sessionLengths = sessions.map(
          sessionId => validLogs.filter(l => l.session_id === sessionId).length
        );
        const avgDialogLength = sessionLengths.length
          ? (sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length).toFixed(1)
          : 0;

        const userSessions = {};
        validLogs.forEach(l => {
          if (!userSessions[l.user_id]) userSessions[l.user_id] = new Set();
          userSessions[l.user_id].add(l.session_id);
        });
        const repeatUsers = Object.values(userSessions).filter(s => s.size > 1).length;
        const retentionRate = Object.keys(userSessions).length
          ? `${Math.round((repeatUsers / Object.keys(userSessions).length) * 100)}%`
          : '0%';

        const successDialogs = sessions.filter(sessionId =>
          validLogs
            .filter(l => l.session_id === sessionId)
            .some(l => l.content && /контакт|заказ|заявк|телефон|email|почт|купил|оплатил|достиг/i.test(l.content))
        ).length;
        const failDialogs = totalDialogs - successDialogs;
        const successRate = totalDialogs ? `${Math.round((successDialogs / totalDialogs) * 100)}%` : '0%';
        const failRate = totalDialogs ? `${Math.round((failDialogs / totalDialogs) * 100)}%` : '0%';

        // График
        const chartMap = {};
        validLogs.forEach(l => {
          if (l.created_at) {
            const date = dayjs(l.created_at).format('YYYY-MM-DD');
            if (!chartMap[date]) chartMap[date] = 0;
            chartMap[date]++;
          }
        });
        let chartArr = Object.entries(chartMap).map(([date, messages]) => ({ date, messages }));

        if (dateRange[0] && dateRange[1]) {
          chartArr = chartArr.filter(item => {
            const d = dayjs(item.date);
            return d.isAfter(dateRange[0].subtract(1, 'day')) && d.isBefore(dateRange[1].add(1, 'day'));
          });
        }

        // Пользователи
        const userMap = {};
        validLogs.forEach(l => {
          if (!userMap[l.user_id]) {
            userMap[l.user_id] = {
              key: l.user_id,
              name: l.first_name || l.username || l.user_id,
              id: l.user_id,
            };
          }
        });
        const usersArr = Object.values(userMap);

        // Чаты
        const chatLogsMap = {};
        validLogs.forEach(l => {
          if (!chatLogsMap[l.user_id]) chatLogsMap[l.user_id] = [];
          chatLogsMap[l.user_id].push({
            from: l.role === 'user' ? 'user' : 'assistant',
            text: l.content || '',
            time: l.created_at,
          });
        });

        // ПРИНУДИТЕЛЬНО устанавливаем метрики
        const newMetrics = {
          totalMessages: totalMessages,
          totalDialogs: totalDialogs,
          avgDialogLength: avgDialogLength,
          retentionRate: retentionRate,
          successRate: successRate,
          failRate: failRate,
          conversion: successRate,
        };

        console.log('Рассчитанные метрики:', newMetrics);

        // Устанавливаем всё одновременно
        setMetrics(newMetrics);
        setChartData(chartArr);
        setUsers(usersArr);
        setChatLogs(chatLogsMap);
        setLoading(false);

      } catch (e) {
        console.error('Ошибка при обработке данных:', e);
        setLoading(false);
        setError('Ошибка соединения с сервером');
      }
    }
    
    fetchData();
  }, [dateRange]);

  const columns = [
    { title: 'Имя', dataIndex: 'name', key: 'name' },
    {
      title: 'Действия',
      key: 'actions',
      render: (_, record) => (
        <Button type="primary" size="small" onClick={() => setSelectedUser(record.id)}>
          История чата
        </Button>
      ),
    },
  ];

  return (
    <div style={{ 
      width: '100%',
      minHeight: '100vh',
      background: '#f0f2f5',
      padding: 'clamp(10px, 2vw, 40px)',
      boxSizing: 'border-box',
      overflow: 'auto'
    }}>
      {/* КОНТЕЙНЕР С ОГРАНИЧЕННОЙ ШИРИНОЙ */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%'
      }}>
        {/* Заголовок */}
        <div style={{ 
          background: '#1890ff', 
          color: '#fff', 
          fontSize: 'clamp(18px, 4vw, 28px)',
          fontWeight: '700', 
          textAlign: 'center',
          padding: 'clamp(15px, 3vw, 25px)',
          marginBottom: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
        }}>
          Дашборд Telegram-бота
        </div>

        {/* АДАПТИВНЫЕ МЕТРИКИ */}
        <div style={{
          background: '#fff',
          padding: 'clamp(20px, 3vw, 40px)',
          marginBottom: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ 
            textAlign: 'center', 
            marginBottom: 'clamp(20px, 3vw, 30px)', 
            fontSize: 'clamp(18px, 3vw, 24px)',
            margin: '0 0 25px 0',
            color: '#1f1f1f'
          }}>
            Основные метрики
          </h2>
          
          {/* СЕТКА С ОГРАНИЧЕННОЙ ШИРИНОЙ ЭЛЕМЕНТОВ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'clamp(15px, 2vw, 25px)',
            fontSize: 'clamp(14px, 2.5vw, 16px)',
            maxWidth: '1200px',
            margin: '0 auto'
          }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)', 
              padding: 'clamp(15px, 2vw, 25px)', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #1890ff',
              boxShadow: '0 2px 8px rgba(24, 144, 255, 0.2)'
            }}>
              <div style={{ 
                fontSize: 'clamp(24px, 5vw, 36px)', 
                fontWeight: 'bold', 
                color: '#1890ff',
                lineHeight: '1.2',
                marginBottom: '8px'
              }}>
                {metrics.totalMessages}
              </div>
              <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#666' }}>
                Всего сообщений
              </div>
            </div>
            
            <div style={{ 
              background: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)', 
              padding: 'clamp(15px, 2vw, 25px)', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #52c41a',
              boxShadow: '0 2px 8px rgba(82, 196, 26, 0.2)'
            }}>
              <div style={{ 
                fontSize: 'clamp(24px, 5vw, 36px)', 
                fontWeight: 'bold', 
                color: '#52c41a',
                lineHeight: '1.2',
                marginBottom: '8px'
              }}>
                {metrics.totalDialogs}
              </div>
              <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#666' }}>
                Всего диалогов
              </div>
            </div>
            
            <div style={{ 
              background: 'linear-gradient(135deg, #fff7e6 0%, #ffd591 100%)', 
              padding: 'clamp(15px, 2vw, 25px)', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #fa8c16',
              boxShadow: '0 2px 8px rgba(250, 140, 22, 0.2)'
            }}>
              <div style={{ 
                fontSize: 'clamp(24px, 5vw, 36px)', 
                fontWeight: 'bold', 
                color: '#fa8c16',
                lineHeight: '1.2',
                marginBottom: '8px'
              }}>
                {metrics.avgDialogLength}
              </div>
              <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#666' }}>
                Средняя длина
              </div>
            </div>
            
            <div style={{ 
              background: 'linear-gradient(135deg, #f9f0ff 0%, #d3adf7 100%)', 
              padding: 'clamp(15px, 2vw, 25px)', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #722ed1',
              boxShadow: '0 2px 8px rgba(114, 46, 209, 0.2)'
            }}>
              <div style={{ 
                fontSize: 'clamp(24px, 5vw, 36px)', 
                fontWeight: 'bold', 
                color: '#722ed1',
                lineHeight: '1.2',
                marginBottom: '8px'
              }}>
                {metrics.retentionRate}
              </div>
              <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#666' }}>
                Retention Rate
              </div>
            </div>
            
            <div style={{ 
              background: 'linear-gradient(135deg, #f6ffed 0%, #b7eb8f 100%)', 
              padding: 'clamp(15px, 2vw, 25px)', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #52c41a',
              boxShadow: '0 2px 8px rgba(82, 196, 26, 0.2)'
            }}>
              <div style={{ 
                fontSize: 'clamp(24px, 5vw, 36px)', 
                fontWeight: 'bold', 
                color: '#52c41a',
                lineHeight: '1.2',
                marginBottom: '8px'
              }}>
                {metrics.successRate}
              </div>
              <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#666' }}>
                Успешных
              </div>
            </div>
            
            <div style={{ 
              background: 'linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%)', 
              padding: 'clamp(15px, 2vw, 25px)', 
              borderRadius: '12px', 
              textAlign: 'center',
              border: '2px solid #ff4d4f',
              boxShadow: '0 2px 8px rgba(255, 77, 79, 0.2)'
            }}>
              <div style={{ 
                fontSize: 'clamp(24px, 5vw, 36px)', 
                fontWeight: 'bold', 
                color: '#ff4d4f',
                lineHeight: '1.2',
                marginBottom: '8px'
              }}>
                {metrics.failRate}
              </div>
              <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#666' }}>
                Неуспешных
              </div>
            </div>
          </div>
          
          {loading && <div style={{ color: '#1890ff', marginTop: '20px', textAlign: 'center', fontSize: 'clamp(14px, 2.5vw, 16px)' }}>Загрузка данных...</div>}
          {error && <div style={{ color: 'red', marginTop: '20px', textAlign: 'center', fontSize: 'clamp(14px, 2.5vw, 16px)' }}>{error}</div>}
        </div>

        {/* АДАПТИВНЫЙ ГРАФИК */}
        <div style={{
          background: '#fff',
          padding: 'clamp(15px, 2vw, 30px)',
          marginBottom: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ 
            marginBottom: '20px', 
            fontSize: 'clamp(16px, 3vw, 22px)',
            margin: '0 0 20px 0',
            color: '#1f1f1f'
          }}>
            Динамика сообщений
          </h3>
          <div style={{ marginBottom: '20px', overflow: 'auto' }}>
            <RangePicker
              onChange={dates => setDateRange(dates)}
              format="YYYY-MM-DD"
              allowClear
              size="middle"
              style={{ fontSize: 'clamp(12px, 2vw, 14px)' }}
            />
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin size="large" />
            </div>
          ) : (
            <div style={{ 
              width: '100%', 
              height: 'clamp(250px, 40vw, 450px)',
              minHeight: '250px'
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    fontSize={12}
                    interval="preserveStartEnd"
                  />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="messages" 
                    stroke="#1890ff" 
                    strokeWidth={3}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* АДАПТИВНАЯ ТАБЛИЦА */}
        <div style={{
          background: '#fff',
          padding: 'clamp(15px, 2vw, 30px)',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          marginBottom: '30px'
        }}>
          <h3 style={{ 
            marginBottom: '20px', 
            fontSize: 'clamp(16px, 3vw, 22px)',
            margin: '0 0 20px 0',
            color: '#1f1f1f'
          }}>
            Пользователи и диалоги
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <Table 
              columns={columns} 
              dataSource={users} 
              pagination={false}
              size="middle"
              scroll={{ x: 400 }}
              style={{ fontSize: 'clamp(12px, 2vw, 14px)' }}
            />
          </div>
        </div>
      </div>

      <Modal
        open={!!selectedUser}
        onCancel={() => setSelectedUser(null)}
        title="История чата"
        footer={null}
        width="90vw"
        style={{ maxWidth: '700px' }}
      >
        <List
          dataSource={chatLogs[selectedUser] || []}
          renderItem={item => (
            <List.Item style={{ fontSize: 'clamp(12px, 2vw, 14px)' }}>
              <div>
                <b>{item.from === 'user' ? 'Пользователь' : 'Ассистент'}:</b> {item.text}
                <div style={{ color: '#aaa', fontSize: 'clamp(10px, 1.5vw, 12px)', marginTop: '5px' }}>
                  {dayjs(item.time).format('YYYY-MM-DD HH:mm')}
                </div>
              </div>
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}

export default App;