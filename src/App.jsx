import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, List, DatePicker, Spin, Tabs, Row, Col, Card, Statistic } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from './supabaseClient';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

function App() {
  const [metrics, setMetrics] = useState({
    totalMessages: 0,
    totalDialogs: 0,
    conversionRate: '0%',
    retentionRate: '0%',
    successDialogs: 0,
    failRate: '0%',
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

        // ВОЗВРАЩАЕМОСТЬ ПО ДНЯМ
        const userDays = {};
        validLogs.forEach(l => {
          if (l.created_at && l.user_id) {
            const date = dayjs(l.created_at).format('YYYY-MM-DD');
            if (!userDays[l.user_id]) userDays[l.user_id] = new Set();
            userDays[l.user_id].add(date);
          }
        });

        const totalUsers = Object.keys(userDays).length;
        const returningUsers = Object.values(userDays).filter(days => days.size > 1).length;
        const retentionRate = totalUsers > 0
          ? `${Math.round((returningUsers / totalUsers) * 100)}%`
          : '0%';

        // УСПЕШНОСТЬ ДИАЛОГОВ
        const successDialogs = sessions.filter(sessionId => {
          const sessionMessages = validLogs.filter(l => l.session_id === sessionId);
          const userMessages = sessionMessages.filter(l => l.role === 'user');

          return userMessages.some(l => {
            if (!l.content) return false;
            const content = l.content.toLowerCase();
            const phonePattern = /(\+7|8)[\s\-\(\)]?[\d\s\-\(\)]{10,}/;
            const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
            const telegramPattern = /@[a-zA-Z0-9_]+/;
            const contactKeywords = /мой телефон|мой номер|можете звонить|вот мой контакт|моя почта|мой email|записывайте/i;

            return phonePattern.test(content) ||
                   emailPattern.test(content) ||
                   telegramPattern.test(content) ||
                   contactKeywords.test(content);
          });
        }).length;

        const failDialogs = totalDialogs - successDialogs;
        const failRate = totalDialogs ? `${Math.round((failDialogs / totalDialogs) * 100)}%` : '0%';

        // КОНВЕРСИЯ В УСПЕШНЫЕ ДИАЛОГИ (из общего количества обращений)
        const conversionRate = totalUsers > 0
          ? `${Math.round((successDialogs / totalUsers) * 100)}%`
          : '0%';

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

        const newMetrics = {
          totalMessages: totalMessages,
          totalDialogs: totalDialogs,
          conversionRate: conversionRate,
          retentionRate: retentionRate,
          successDialogs: successDialogs,
          failRate: failRate,
        };

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
        <Button
          type="primary"
          size="small"
          onClick={() => setSelectedUser(record.id)}
          style={{
            background: '#1890ff',
            border: '1px solid #1890ff',
            borderRadius: '6px',
            color: 'white',
            fontWeight: '500'
          }}
        >
          История чата
        </Button>
      ),
    },
  ];

  return (
    <div style={{
      padding: '0',
      background: '#f8f9fa',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* ЗАГОЛОВОК */}
      <div style={{
        background: '#ffffff',
        color: '#2c3e50',
        padding: '60px 40px',
        textAlign: 'center',
        borderBottom: '1px solid #e9ecef',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <h1 style={{
          margin: '0',
          fontSize: '48px',
          fontWeight: '300',
          letterSpacing: '-1px',
          color: '#2c3e50'
        }}>
          Дашборд Ассистент Exai
        </h1>
        <p style={{
          margin: '16px 0 0 0',
          fontSize: '18px',
          color: '#6c757d',
          fontWeight: '300'
        }}>
          Аналитика и метрики взаимодействий
        </p>
      </div>

      <div style={{ padding: '40px' }}>
        {/* ВКЛАДКИ */}
        <Tabs
          defaultActiveKey="1"
          size="large"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '40px',
            border: '1px solid #e9ecef',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
          }}
          tabBarStyle={{
            marginBottom: '40px',
            borderBottom: '1px solid #e9ecef'
          }}
        >

          {/* ВКЛАДКА 1: ОСНОВНЫЕ МЕТРИКИ */}
          <TabPane tab="Основные метрики" key="1">
            <Row gutter={[32, 32]}>
              <Col xs={24} sm={12} md={8}>
                <Card style={{
                  background: '#ffffff',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '56px',
                      fontWeight: '200',
                      marginBottom: '12px',
                      color: '#2c3e50'
                    }}>
                      {metrics.totalMessages}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#6c757d',
                      fontWeight: '400',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      Всего сообщений
                    </div>
                  </div>
                </Card>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Card style={{
                  background: '#ffffff',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '56px',
                      fontWeight: '200',
                      marginBottom: '12px',
                      color: '#2c3e50'
                    }}>
                      {metrics.totalDialogs}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#6c757d',
                      fontWeight: '400',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      Всего диалогов
                    </div>
                  </div>
                </Card>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Card style={{
                  background: '#ffffff',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '56px',
                      fontWeight: '200',
                      marginBottom: '12px',
                      color: '#2c3e50'
                    }}>
                      {metrics.conversionRate}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#6c757d',
                      fontWeight: '400',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      Конверсия в успешные диалоги
                    </div>
                  </div>
                </Card>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Card style={{
                  background: '#ffffff',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '56px',
                      fontWeight: '200',
                      marginBottom: '12px',
                      color: '#2c3e50'
                    }}>
                      {metrics.retentionRate}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#6c757d',
                      fontWeight: '400',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      Возвращаемость
                    </div>
                  </div>
                </Card>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Card style={{
                  background: '#ffffff',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '56px',
                      fontWeight: '200',
                      marginBottom: '12px',
                      color: '#2c3e50'
                    }}>
                      {metrics.successDialogs}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#6c757d',
                      fontWeight: '400',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      Оставили контакты
                    </div>
                  </div>
                </Card>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Card style={{
                  background: '#ffffff',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '56px',
                      fontWeight: '200',
                      marginBottom: '12px',
                      color: '#2c3e50'
                    }}>
                      {metrics.failRate}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#6c757d',
                      fontWeight: '400',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      Без контактов
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>

            {loading && (
              <div style={{
                textAlign: 'center',
                marginTop: '60px',
                fontSize: '16px',
                color: '#6c757d'
              }}>
                Загрузка данных...
              </div>
            )}
            {error && (
              <div style={{
                textAlign: 'center',
                marginTop: '60px',
                fontSize: '16px',
                color: '#dc3545'
              }}>
                {error}
              </div>
            )}
          </TabPane>

          {/* ВКЛАДКА 2: ГРАФИК */}
          <TabPane tab="Динамика сообщений" key="2">
            <div style={{ marginBottom: '40px' }}>
              <RangePicker
                onChange={dates => setDateRange(dates)}
                format="YYYY-MM-DD"
                allowClear
                size="large"
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  borderRadius: '6px',
                  border: '1px solid #e9ecef'
                }}
              />
            </div>

            {loading ? (
              <div style={{
                textAlign: 'center',
                padding: '100px',
                fontSize: '16px',
                color: '#6c757d'
              }}>
                <Spin size="large" />
                <div style={{ marginTop: '20px' }}>Загрузка графика...</div>
              </div>
            ) : (
              <div style={{
                width: '100%',
                height: '500px',
                background: '#ffffff',
                borderRadius: '8px',
                padding: '30px',
                border: '1px solid #e9ecef',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
                    <XAxis
                      dataKey="date"
                      fontSize={12}
                      stroke="#6c757d"
                      tick={{ fill: '#6c757d' }}
                    />
                    <YAxis
                      fontSize={12}
                      stroke="#6c757d"
                      tick={{ fill: '#6c757d' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#ffffff',
                        border: '1px solid #e9ecef',
                        borderRadius: '6px',
                        color: '#2c3e50',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="messages"
                      stroke="#1890ff"
                      strokeWidth={2}
                      dot={{
                        fill: '#1890ff',
                        strokeWidth: 2,
                        r: 4
                      }}
                      activeDot={{
                        r: 6,
                        fill: '#1890ff',
                        strokeWidth: 2
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </TabPane>

          {/* ВКЛАДКА 3: ПОЛЬЗОВАТЕЛИ */}
          <TabPane tab="Пользователи и диалоги" key="3">
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '30px',
              border: '1px solid #e9ecef',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
              <Table
                columns={columns}
                dataSource={users}
                pagination={{
                  pageSize: 15,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} пользователей`
                }}
                size="middle"
                scroll={{ x: 600 }}
                style={{
                  background: 'transparent'
                }}
              />
            </div>
          </TabPane>
        </Tabs>
      </div>

      {/* МОДАЛЬНОЕ ОКНО */}
      <Modal
        open={!!selectedUser}
        onCancel={() => setSelectedUser(null)}
        title={
          <div style={{
            fontSize: '18px',
            fontWeight: '400',
            color: '#2c3e50'
          }}>
            История чата
          </div>
        }
        footer={null}
        width="90vw"
        style={{ 
          maxWidth: '800px'
        }}
        bodyStyle={{
          maxHeight: '60vh',
          overflowY: 'auto',
          padding: '30px',
          background: '#ffffff'
        }}
      >
        <List
          dataSource={chatLogs[selectedUser] || []}
          renderItem={item => (
            <List.Item style={{
              padding: '20px 0',
              borderBottom: '1px solid #e9ecef'
            }}>
              <div style={{ width: '100%' }}>
                <div style={{
                  fontWeight: '500',
                  color: item.from === 'user' ? '#2c3e50' : '#6c757d',
                  marginBottom: '12px',
                  fontSize: '14px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  {item.from === 'user' ? 'Пользователь' : 'Ассистент'}
                </div>
                <div style={{
                  marginBottom: '12px',
                  fontSize: '16px',
                  lineHeight: '1.5',
                  color: '#2c3e50'
                }}>
                  {item.text}
                </div>
                <div style={{
                  color: '#adb5bd',
                  fontSize: '12px',
                  fontWeight: '400'
                }}>
                  {dayjs(item.time).format('DD.MM.YYYY HH:mm')}
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