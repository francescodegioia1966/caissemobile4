import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "./supabaseClient";
import TableManagementView from "./TableManagementView";
import MenuManagementView from "./MenuManagementView";
import PaymentView from "./PaymentView";
import ReceiptViewer from "./ReceiptViewer";
import printJS from "print-js";
import { useSwipeable } from "react-swipeable"; // Importa useSwipeable

const CashControlModal = ({ data, onClose }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-75 z-50">
    <div className="bg-white p-6 rounded-lg shadow-lg w-1/2">
      <h2 className="text-2xl font-bold mb-4">Controllo Cassa</h2>
      <div className="mb-2">
        <strong>Totale Contanti:</strong> €{data.cash.toFixed(2)}
      </div>
      <div className="mb-2">
        <strong>Totale Carta:</strong> €{data.card.toFixed(2)}
      </div>
      <div className="mb-2">
        <strong>Totale Generale:</strong> €{data.total.toFixed(2)}
      </div>
      <div className="mb-2">
        <strong>Inizio Sessione:</strong>{" "}
        {new Date(data.start_time).toLocaleString()}
      </div>
      <div className="mb-2">
        <strong>Fine Sessione:</strong>{" "}
        {data.end_time
          ? new Date(data.end_time).toLocaleString()
          : "Sessione ancora aperta"}
      </div>
      <div className="mb-2">
        <strong>Totale Rimborsi:</strong> €{(-data.refunds).toFixed(2)}{" "}
        {/* Assumendo che refunds sia negativo */}
      </div>
      <div className="mb-4">
        <strong>Totale Tavoli Aperti:</strong> €
        {data.totalOpenTables.toFixed(2)}
      </div>
      <button
        onClick={onClose}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Chiudi
      </button>
    </div>
  </div>
);
const RestaurantCashRegister = () => {
  const saveOrdersTimeoutRef = useRef(null);
  const [activeSection, setActiveSection] = useState("tables");
  const [autosaveMessage, setAutosaveMessage] = useState(false);
  const inactivityTimerRef = useRef(null);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { t, i18n } = useTranslation();
  const [showInfoMessage, setShowInfoMessage] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [selectedTable, setSelectedTable] = useState(null);
  const [orders, setOrders] = useState({});
  const [showTableManagement, setShowTableManagement] = useState(false);
  const [showMenuManagement, setShowMenuManagement] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showReceiptViewer, setShowReceiptViewer] = useState(false);
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState({});
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [hasOpenTables, setHasOpenTables] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [filterDestination, setFilterDestination] = useState("all");
  const [showRefund, setShowRefund] = useState(false);
  const [showCashControlModal, setShowCashControlModal] = useState(false);
  const [cashControlData, setCashControlData] = useState(null);
  const [showCurrentOrderModal, setShowCurrentOrderModal] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [newTableInfo, setNewTableInfo] = useState("");
  const isEditingOrderRef = useRef(isEditingOrder);
  const [isSaving, setIsSaving] = useState(false);
  const sections = ["tables", "menu", "orders"]; // Definisci l'ordine delle sezioni

  const ordersRef = useRef(orders);
  const selectedTableRef = useRef(selectedTable);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    selectedTableRef.current = selectedTable;
  }, [selectedTable]);

  // Definisci prima handleOrderChange
  const handleOrderChange = (category, item, increment, newPrice = null) => {
    if (!isSessionActive) {
      alert(
        "La sessione di cassa non è attiva. Impossibile modificare gli ordini."
      );
      return;
    }

    if (!selectedTable) {
      showMessage(
        "Per favore, seleziona un tavolo prima di aggiungere articoli."
      );
      return;
    }

    if (!isEditingOrder) {
      setIsEditingOrder(true);
    }

    setOrders((prevOrders) => {
      const updatedOrders = { ...prevOrders };
      const tableOrders = updatedOrders[selectedTable]
        ? [...updatedOrders[selectedTable]]
        : [];

      let existingItemIndex;

      if (item.id) {
        // Cerca l'articolo per ID
        existingItemIndex = tableOrders.findIndex(
          (orderItem) => orderItem.id === item.id
        );
      } else {
        // Cerca l'articolo per nome (per aggiunte dal menu)
        existingItemIndex = tableOrders.findIndex(
          (orderItem) => orderItem.name === item.name && !orderItem.modified // Verifica che non sia stato modificato
        );
      }

      if (existingItemIndex > -1) {
        const newQuantity = tableOrders[existingItemIndex].quantity + increment;
        if (newQuantity > 0) {
          tableOrders[existingItemIndex] = {
            ...tableOrders[existingItemIndex],
            quantity: newQuantity,
            price:
              newPrice !== null
                ? newPrice
                : tableOrders[existingItemIndex].price,
          };
        } else {
          tableOrders.splice(existingItemIndex, 1);
        }
      } else if (increment > 0) {
        // Aggiungi un nuovo articolo con ID univoco
        const newItem = {
          ...item,
          id: `${selectedTable}_${Date.now()}_${Math.random()}`,
          quantity: increment,
          price: newPrice !== null ? newPrice : item.price,
          modified: false,
        };
        tableOrders.push(newItem);
      }

      updatedOrders[selectedTable] = tableOrders;
      checkOpenTables();
      return updatedOrders;
    });
  };

  const handleSwipeLeft = () => {
    const currentIndex = sections.indexOf(activeSection);
    if (currentIndex < sections.length - 1) {
      setActiveSection(sections[currentIndex + 1]);
    }
  };

  const handleSwipeRight = () => {
    const currentIndex = sections.indexOf(activeSection);
    if (currentIndex > 0) {
      setActiveSection(sections[currentIndex - 1]);
    }
  };

  // Configura i gestori di swipe
  const handlers = useSwipeable({
    onSwipedLeft: () => handleSwipeLeft(),
    onSwipedRight: () => handleSwipeRight(),
    preventDefaultTouchmoveEvent: true,
    trackMouse: false, // Imposta su true se vuoi supportare anche swipe con il mouse
  });

  const calculateTotalOpenTables = () => {
    return Object.values(orders).reduce((acc, tableOrders) => {
      const tableTotal = tableOrders.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      return acc + tableTotal;
    }, 0);
  };

  // Definisci handleAddItem dopo handleOrderChange
  const handleAddItem = (category, item) => {
    if (!selectedTable) {
      showMessage(
        "Per favore, seleziona un tavolo prima di aggiungere articoli."
      );
    } else {
      setOrders((prevOrders) => {
        const updatedOrders = { ...prevOrders };
        const tableOrders = updatedOrders[selectedTable]
          ? [...updatedOrders[selectedTable]]
          : [];

        // Cerca un articolo con lo stesso nome e non modificato
        const existingItemIndex = tableOrders.findIndex(
          (orderItem) => orderItem.name === item.name && !orderItem.modified // Verifica che non sia stato modificato
        );

        if (existingItemIndex > -1) {
          // Incrementa la quantità dell'articolo esistente
          tableOrders[existingItemIndex] = {
            ...tableOrders[existingItemIndex],
            quantity: tableOrders[existingItemIndex].quantity + 1,
          };
        } else {
          // Aggiungi un nuovo articolo con ID univoco
          const newItem = {
            ...item,
            id: `${selectedTable}_${Date.now()}_${Math.random()}`,
            quantity: 1,
            modified: false, // Indica che l'articolo non è stato modificato
          };
          tableOrders.push(newItem);
        }

        updatedOrders[selectedTable] = tableOrders;
        return updatedOrders;
      });
    }
  };

  useEffect(() => {
    isEditingOrderRef.current = isEditingOrder;
  }, [isEditingOrder]);

  const showMessage = (message) => {
    setInfoMessage(message);
    setShowInfoMessage(true);
    setTimeout(() => setShowInfoMessage(false), 3000);
  };

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    console.log("Imposto il timer di inattività");
    inactivityTimerRef.current = setTimeout(async () => {
      console.log("Timer di inattività scaduto, avvio l'autosalvataggio");
      setAutosaveMessage(true);
      setTimeout(async () => {
        setAutosaveMessage(false);
        const currentSelectedTable = selectedTableRef.current;
        const currentOrders = ordersRef.current;

        if (
          currentSelectedTable &&
          currentOrders[currentSelectedTable]?.length > 0
        ) {
          // Cancella eventuali salvataggi pendenti
          if (saveOrdersTimeoutRef.current) {
            clearTimeout(saveOrdersTimeoutRef.current);
            saveOrdersTimeoutRef.current = null;
          }

          try {
            await handleConfirmOrder();
            // L'autosalvataggio ha confermato l'ordine e riportato l'utente alla sezione tavoli
          } catch (error) {
            console.error("Errore nell'autosalvataggio dell'ordine:", error);
            alert(
              "Si è verificato un errore nell'autosalvataggio dell'ordine. Riprova."
            );
          }
        }
      }, 3000); // Tempo per mostrare il messaggio "AUTOSAVE in corso..."
    }, 15000); // 15 secondi di inattività
  };

  const checkSession = async () => {
    const session = supabase.auth.session();
    if (!session) {
      // La sessione non è più valida
      // Puoi chiedere all'utente di rieffettuare il login o rinfrescare la sessione
    }
  };

  const handleConfirmOrder = async () => {
    const currentSelectedTable = selectedTableRef.current;
    const currentOrders = ordersRef.current;

    if (currentSelectedTable) {
      if (currentOrders[currentSelectedTable]?.length > 0) {
        // Cancella eventuali salvataggi pendenti
        if (saveOrdersTimeoutRef.current) {
          clearTimeout(saveOrdersTimeoutRef.current);
          saveOrdersTimeoutRef.current = null;
        }

        try {
          const tableOrders = currentOrders[currentSelectedTable];
          await saveOrderToDatabase(currentSelectedTable, tableOrders);
          showMessage("Ordine confermato.");
        } catch (error) {
          console.error("Errore nella conferma dell'ordine:", error);
          alert(
            "Si è verificato un errore nella conferma dell'ordine. Riprova."
          );
          return;
        }
      } else {
        showMessage("Nessun articolo nell'ordine da confermare.");
      }

      if (!checkIfAnyModalOpen()) {
        setIsEditingOrder(false);
        setSelectedTable(null);
      }

      await fetchOrders();
    }
  };

  const handleCancelOrder = () => {
    if (selectedTable) {
      // Rimuovi gli ordini dal localStorage
      localStorage.removeItem(`orders_${selectedTable}`);
    }
    setIsEditingOrder(false);
    setSelectedTable(null);
    showMessage("Ordine annullato.");
  };

  useEffect(() => {
    const events = [
      "mousemove",
      "mousedown",
      "keypress",
      "touchstart",
      "scroll",
    ];

    const handleUserActivity = () => {
      if (isEditingOrder && !checkIfAnyModalOpen()) {
        resetInactivityTimer();
      }
    };

    if (isEditingOrder && !checkIfAnyModalOpen()) {
      events.forEach((event) => {
        window.addEventListener(event, handleUserActivity);
      });
      resetInactivityTimer();
    } else {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    }

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [
    isEditingOrder,
    showPayment,
    showReceiptViewer,
    showCurrentOrderModal,
    showEndSessionModal,
    showRefund,
  ]);

  useEffect(() => {
    checkActiveSession();
    fetchTables();
    fetchMenu();

    const tavoliInterval = setInterval(fetchTables, 10000);
    const menuInterval = setInterval(fetchMenu, 60000);

    return () => {
      clearInterval(tavoliInterval);
      clearInterval(menuInterval);
    };
  }, []);

  useEffect(() => {
    checkOpenTables();
  }, [orders]);

  useEffect(() => {
    if (selectedTable && orders[selectedTable]) {
      if (saveOrdersTimeoutRef.current) {
        clearTimeout(saveOrdersTimeoutRef.current);
      }

      saveOrdersTimeoutRef.current = setTimeout(async () => {
        try {
          const tableOrders = orders[selectedTable];
          const order_id = await getOrCreateOrderId(selectedTable);
          const currentTime = new Date().toISOString();
          const tableInfo =
            tables.find((table) => table.name === selectedTable)?.info || "";

          const { error } = await supabase.from("orders").upsert({
            table_id: selectedTable,
            items: JSON.stringify(tableOrders),
            created_at: currentTime,
            status: "active",
            order_id: order_id,
            payment_status: null,
            notes: tableInfo,
          });

          if (error) {
            throw error;
          }
        } catch (error) {
          console.error("Errore nell'aggiornamento del database:", error);
          alert(
            "Si è verificato un errore nell'aggiornamento dell'ordine. Riprova."
          );
        }
      }, 500); // Debounce di 500ms
    }

    return () => {
      if (saveOrdersTimeoutRef.current) {
        clearTimeout(saveOrdersTimeoutRef.current);
      }
    };
  }, [orders[selectedTable], selectedTable]);

  useEffect(() => {
    if (selectedTable && orders[selectedTable]) {
      localStorage.setItem(
        `orders_${selectedTable}`,
        JSON.stringify(orders[selectedTable])
      );
    }
  }, [orders[selectedTable], selectedTable]);

  useEffect(() => {
    let ordiniInterval;

    if (!isEditingOrder) {
      fetchOrders();
      ordiniInterval = setInterval(fetchOrders, 5000);
    }

    return () => {
      if (ordiniInterval) clearInterval(ordiniInterval);
    };
  }, [isEditingOrder]);

  const checkActiveSession = async () => {
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("*")
      .is("end_time", null)
      .order("start_time", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error checking active session:", error);
    } else if (data && data.length > 0) {
      setIsSessionActive(true);
      setCurrentSessionId(data[0].id);
    } else {
      setIsSessionActive(false);
      setCurrentSessionId(null);
    }
  };

  const checkIfAnyModalOpen = () => {
    return (
      showPayment ||
      showReceiptViewer ||
      showCurrentOrderModal ||
      showEndSessionModal ||
      showRefund
    );
  };

  const handleSupabaseError = async (error) => {
    console.error("Errore Supabase:", error);
    if (error.message.includes("JWT expired")) {
      const refreshSuccessful = await refreshSession();
      if (!refreshSuccessful) {
        alert("La sessione è scaduta. Effettua nuovamente il login.");
        // Qui puoi reindirizzare l'utente alla pagina di login
        return false;
      }
      return true;
    }
    alert("Si è verificato un errore. Riprova.");
    return false;
  };

  const fetchTables = async () => {
    try {
      const { data, error } = await supabase
        .from("tables")
        .select("*")
        .order("id");
      if (error) {
        const handled = await handleSupabaseError(error);
        if (handled) return fetchTables(); // Riprova se l'errore è stato gestito
        return;
      }
      setTables(data.map((table) => ({ name: table.name, info: table.notes })));
    } catch (error) {
      console.error("Error fetching tables:", error);
      alert("Si è verificato un errore nel caricamento dei tavoli. Riprova.");
    }
  };

  const fetchMenu = async () => {
    try {
      const { data, error } = await supabase.from("menu").select("*");
      if (error) throw error;

      const menuObj = data.reduce((acc, item) => {
        if (!acc[item.category]) {
          acc[item.category] = [];
        }
        acc[item.category].push({
          name: item.name,
          price: parseFloat(item.price),
          destinazione: item.destinazione,
        });
        return acc;
      }, {});

      setMenu(menuObj);
    } catch (error) {
      console.error("Error fetching menu:", error);
      alert("Si è verificato un errore nel caricamento del menu. Riprova.");
    }
  };

  const fetchOrders = async () => {
    if (isEditingOrder) {
      return;
    }
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .or("payment_status.is.null,payment_status.neq.paid");

      if (error) throw error;

      const ordersObj = data.reduce((acc, order) => {
        if (!acc[order.table_id]) {
          acc[order.table_id] = [];
        }

        const items = JSON.parse(order.items).map((item) => ({
          ...item,
          id: item.id, // Mantieni l'ID
        }));

        acc[order.table_id] = items;

        return acc;
      }, {});

      setOrders(ordersObj);
      checkOpenTables();
    } catch (error) {
      console.error("Error fetching orders:", error);
      alert("Si è verificato un errore nel caricamento degli ordini. Riprova.");
    }
  };

  const checkOpenTables = () => {
    const openTables = Object.entries(orders).some(
      ([tableId, tableOrders]) =>
        tableOrders &&
        tableOrders.length > 0 &&
        tableOrders.some((order) => order.payment_status !== "paid")
    );
    setHasOpenTables(openTables);
  };

  const getOrCreateOrderId = async (tableId) => {
    const { data, error } = await supabase
      .from("orders")
      .select("order_id")
      .eq("table_id", tableId)
      .is("payment_status", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error fetching order_id:", error);
      throw error;
    }

    if (data && data.length > 0) {
      return data[0].order_id;
    } else {
      return `${tableId}_${Date.now()}`;
    }
  };

  const saveOrderToDatabase = async (tableId, tableOrders) => {
    try {
      const order_id = await getOrCreateOrderId(tableId);
      const currentTime = new Date().toISOString();
      const tableInfo =
        tables.find((table) => table.name === tableId)?.info || "";

      const { error } = await supabase.from("orders").upsert({
        table_id: tableId,
        items: JSON.stringify(tableOrders),
        created_at: currentTime,
        status: "active",
        order_id: order_id,
        payment_status: null,
        notes: tableInfo,
      });

      if (error) {
        throw error;
      }

      // Aggiorniamo lo stato degli ordini se necessario
      setOrders((prevOrders) => {
        const newOrders = { ...prevOrders };
        newOrders[tableId] = tableOrders;
        return newOrders;
      });
      checkOpenTables();
    } catch (error) {
      console.error("Errore nell'aggiornamento del database:", error);
      alert(
        "Si è verificato un errore nell'aggiornamento dell'ordine. Riprova."
      );
    }
  };

  const handleTableSelection = (tableName) => {
    setSelectedTable(tableName);
    setIsEditingOrder(true);

    // Recupera gli ordini dal localStorage
    const savedOrders = localStorage.getItem(`orders_${tableName}`);
    if (savedOrders) {
      setOrders((prevOrders) => ({
        ...prevOrders,
        [tableName]: JSON.parse(savedOrders),
      }));
    } else {
      // Se non ci sono ordini salvati, inizializza con un array vuoto
      setOrders((prevOrders) => ({
        ...prevOrders,
        [tableName]: [],
      }));
    }
  };

  const handleUpdateMenu = async (updatedMenu) => {
    try {
      await supabase.from("menu").delete().not("id", "is", null);

      const menuItems = Object.entries(updatedMenu).flatMap(
        ([category, items]) =>
          items.map((item) => ({
            category,
            name: item.name,
            price: parseFloat(item.price),
            destinazione: item.destinazione,
          }))
      );

      await supabase.from("menu").insert(menuItems);

      setMenu(updatedMenu);
      console.log("Menu aggiornato con successo");
    } catch (error) {
      console.error("Errore durante l'aggiornamento del menu:", error);
      alert(
        "Si è verificato un errore durante l'aggiornamento del menu. Riprova."
      );
    }
  };

  const filteredOrders = (tableOrders) => {
    if (filterDestination === "all") return tableOrders;
    return tableOrders.filter((item) => {
      const menuItem = Object.values(menu)
        .flat()
        .find((menuItem) => menuItem.name === item.name);
      return menuItem && menuItem.destinazione === filterDestination;
    });
  };

  const handleUpdateTables = async (updatedTables) => {
    try {
      await supabase.from("tables").delete().not("id", "is", null);
      await supabase.from("tables").insert(
        updatedTables.map((table) => ({
          name: table.name,
          notes: table.info,
        }))
      );

      setTables(updatedTables);
      await fetchTables();

      const updatedOrders = { ...orders };
      Object.keys(updatedOrders).forEach((table) => {
        if (!updatedTables.some((t) => t.name === table)) {
          delete updatedOrders[table];
        }
      });
      setOrders(updatedOrders);
      if (
        selectedTable &&
        !updatedTables.some((t) => t.name === selectedTable)
      ) {
        setSelectedTable(null);
      }
      checkOpenTables();
    } catch (error) {
      console.error("Error updating tables:", error);
      alert(
        "Si è verificato un errore nell'aggiornamento dei tavoli. Riprova."
      );
    }
  };

  const handlePayment = () => {
    if (!isSessionActive) {
      alert(
        "La sessione di cassa non è attiva. Impossibile effettuare pagamenti."
      );
      return;
    }

    if (!selectedTable) {
      showMessage(
        "Per favore, seleziona un tavolo prima di procedere al pagamento."
      );
      return;
    }

    if (selectedTable && orders[selectedTable]?.length > 0) {
      setShowPayment(true);
    } else {
      showMessage("Non ci sono ordini per questo tavolo.");
    }
  };

  const handleConfirmPayment = async (cashReceived, cardPayment) => {
    if (selectedTable && orders[selectedTable]?.length > 0) {
      const totalAmount = orders[selectedTable].reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const changeAmount = Math.max(
        cashReceived + cardPayment - totalAmount,
        0
      );

      try {
        const order_id = await getOrCreateOrderId(selectedTable);

        await supabase.from("payments").insert({
          table_id: selectedTable,
          total_amount: totalAmount,
          cash_amount: cashReceived,
          card_amount: cardPayment,
          change_amount: changeAmount,
          items: JSON.stringify(orders[selectedTable] || []),
          created_at: new Date().toISOString(),
          server_name: "Default Server",
          notes: "",
        });

        await supabase
          .from("orders")
          .update({ payment_status: "paid" })
          .eq("table_id", selectedTable)
          .eq("order_id", order_id)
          .is("payment_status", null);

        setOrders((prevOrders) => {
          const newOrders = { ...prevOrders };
          delete newOrders[selectedTable];
          return newOrders;
        });

        setShowPayment(false);
        setSelectedTable(null);
        setIsEditingOrder(false);
        console.log("Pagamento registrato con successo");
      } catch (error) {
        console.error("Errore durante la registrazione del pagamento:", error);
        alert("Si è verificato un errore durante il pagamento. Riprova.");
      } finally {
        checkOpenTables();
        fetchOrders();
      }
    }
  };

  const handleStartSession = async () => {
    try {
      const { data, error } = await supabase
        .from("cash_sessions")
        .insert({ start_time: new Date().toISOString() })
        .select();

      if (error) throw error;

      setIsSessionActive(true);
      setCurrentSessionId(data[0].id);
    } catch (error) {
      console.error("Error starting session:", error);
      alert("Errore nell'avvio della sessione. Riprova.");
    }
  };

  const handleEndSession = async () => {
    try {
      // Verifica se ci sono tavoli non pagati
      if (hasOpenTables) {
        alert(
          "Non puoi chiudere la sessione mentre ci sono tavoli non pagati."
        );
        return;
      }

      // Imposta l'end_time e marca la sessione come inattiva
      const endTime = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("cash_sessions")
        .update({
          end_time: endTime,
          is_active: false,
        })
        .eq("id", currentSessionId);

      if (updateError) throw updateError;

      // Calcola i totali basandoti sull'end_time appena impostato
      const cashControlData = await handleCashControl();
      console.log("Cash Control Data:", cashControlData);

      // Aggiorna la sessione con i totali calcolati
      const { error: totalsError } = await supabase
        .from("cash_sessions")
        .update({
          total_cash: cashControlData.cash,
          total_card: cashControlData.card,
          total_amount: cashControlData.total,
        })
        .eq("id", currentSessionId);

      if (totalsError) throw totalsError;

      // Pulisci il database degli ordini
      await clearOrdersDatabase();

      // Aggiorna lo stato dell'applicazione
      setIsSessionActive(false);
      setCurrentSessionId(null);
      alert("Sessione chiusa con successo.");
      await checkActiveSession();
      setOrders({});
    } catch (error) {
      console.error("Error ending session:", error);
      alert("Errore nella chiusura della sessione. Riprova.");
    }
  };

  const handleConfirmEndSession = () => {
    setShowEndSessionModal(false);
    handleEndSession();
  };

  const calculateUnpaidTablesTotal = () => {
    return Object.values(orders).reduce((total, tableOrders) => {
      const tableTotal = tableOrders.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      return total + tableTotal;
    }, 0);
  };

  const handleCashControl = async () => {
    try {
      console.log("Inizio controllo cassa");

      // Recupera l'ultima sessione attiva o chiusa
      const { data: lastSession, error: sessionError } = await supabase
        .from("cash_sessions")
        .select("*")
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle(); // Utilizza maybeSingle per gestire 0 o 1 risultato

      if (sessionError) throw sessionError;
      if (!lastSession) {
        throw new Error("Nessuna sessione trovata");
      }

      console.log("Ultima sessione:", lastSession);

      // Definisci l'end_time per il calcolo (se la sessione è chiusa)
      const endTime = lastSession.end_time
        ? lastSession.end_time
        : new Date().toISOString();
      console.log("End Time:", endTime);

      // Recupera i pagamenti all'interno dell'intervallo della sessione, includendo table_id
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("payments")
        .select(
          "cash_amount, card_amount, total_amount, change_amount, table_id"
        )
        .gte("created_at", lastSession.start_time)
        .lte("created_at", endTime);

      if (paymentsError) throw paymentsError;
      console.log("Pagamenti recuperati:", paymentsData);

      // Calcola i totali dei pagamenti e dei rimborsi
      let paymentTotals = { cash: 0, card: 0, total: 0 };
      let refundTotals = { cash: 0, card: 0, total: 0 };

      paymentsData.forEach((payment) => {
        if (payment.table_id !== "N/A") {
          // Pagamenti normali
          paymentTotals.cash += parseFloat(payment.cash_amount) || 0;
          paymentTotals.card += parseFloat(payment.card_amount) || 0;
          paymentTotals.total += parseFloat(payment.total_amount) || 0;

          // Considera il cambiamento (change_amount)
          paymentTotals.cash -= parseFloat(payment.change_amount) || 0;
        } else {
          // Rimborsi
          refundTotals.cash += parseFloat(payment.cash_amount) || 0; // Positivo perché cash_amount è negativo
          refundTotals.card += parseFloat(payment.card_amount) || 0; // Se applicabile
          refundTotals.total += parseFloat(payment.total_amount) || 0;
        }
      });

      console.log("Totali Pagamenti:", paymentTotals);
      console.log("Totali Rimborsi:", refundTotals);

      // Combina i totali dei pagamenti e dei rimborsi
      const combinedTotals = {
        cash: parseFloat((paymentTotals.cash + refundTotals.cash).toFixed(2)),
        card: parseFloat((paymentTotals.card + refundTotals.card).toFixed(2)),
        total: parseFloat(
          (paymentTotals.total + refundTotals.total).toFixed(2)
        ),
        start_time: lastSession.start_time,
        end_time: lastSession.end_time,
        refunds: parseFloat(refundTotals.cash.toFixed(2)),
      };

      console.log("Totali Combinati:", combinedTotals);

      // Calcola il totale dei tavoli aperti
      const totalOpenTables = calculateTotalOpenTables();

      // Combina i dati
      const fullCashControlData = { ...combinedTotals, totalOpenTables };

      console.log(
        "Cash Control Data con Totale Tavoli Aperti:",
        fullCashControlData
      );

      // Imposta i dati nello stato e mostra il modal
      setCashControlData(fullCashControlData);
      setShowCashControlModal(true);

      return fullCashControlData; // Assicurati che questa funzione ritorni i totali
    } catch (error) {
      console.error("Error in cash control:", error);
      alert(
        error.message ||
          "Si è verificato un errore durante il controllo cassa. Riprova."
      );
      throw error; // Rilancia l'errore per gestirlo in handleEndSession
    }
  };

  const clearOrdersDatabase = async () => {
    try {
      await supabase.from("orders").delete().not("id", "is", null);
      await supabase.from("completed_orders").delete().not("id", "is", null);
      await supabase
        .from("completed_orders_bar")
        .delete()
        .not("id", "is", null);

      console.log(
        "Database 'orders', 'completed_orders' e 'completed_orders_bar' svuotati con successo"
      );
    } catch (error) {
      console.error("Errore nello svuotamento dei database:", error);
      alert(
        "Si è verificato un errore nello svuotamento dei database. Riprova."
      );
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const handleConfirmRefund = async (amount, description) => {
    try {
      await supabase.from("payments").insert({
        table_id: "N/A",
        total_amount: parseFloat(amount),
        cash_amount: parseFloat(amount),
        card_amount: 0,
        change_amount: 0,
        items: JSON.stringify([]),
        created_at: new Date().toISOString(),
        server_name: "Default Server",
        notes: description,
      });
      setShowRefund(false);
      alert("Rimborso registrato con successo.");
    } catch (error) {
      console.error("Errore durante il rimborso:", error);
      alert("Si è verificato un errore durante il rimborso. Riprova.");
    }
  };

  const handleShowCurrentOrder = () => {
    if (!selectedTable) {
      showMessage(
        "Per favore, seleziona un tavolo per visualizzare gli ordini in corso."
      );
      return;
    }

    if (!orders[selectedTable]?.length) {
      showMessage("Non ci sono ordini in corso per questo tavolo.");
      return;
    }

    setShowCurrentOrderModal(true);
  };

  const currentTable = tables.find((table) => table.name === selectedTable);

  const isAnyModalOpen =
    showPayment ||
    showReceiptViewer ||
    showEndSessionModal ||
    showRefund ||
    showCurrentOrderModal;

  const refreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session) {
        setIsSessionExpired(false);
        setIsSessionActive(true);
        checkActiveSession();
      } else {
        setIsSessionExpired(true);
        setErrorMessage(
          "La sessione è scaduta. Si prega di ricaricare la pagina."
        );
      }
    } catch (error) {
      console.error("Errore nel refresh della sessione:", error);
      setIsSessionExpired(true);
      setErrorMessage(
        "Si è verificato un errore. Si prega di ricaricare la pagina."
      );
    }
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      refreshSession();
    }
  };

  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (isAnyModalOpen) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    } else {
      resetInactivityTimer();
    }

    return () => {
      if (isAnyModalOpen && inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isAnyModalOpen]);

  const handleSaveTableInfo = async () => {
    if (!selectedTable) return;

    try {
      const { error } = await supabase
        .from("tables")
        .update({ notes: newTableInfo })
        .eq("name", selectedTable);

      if (error) {
        throw error;
      }

      setTables((prevTables) =>
        prevTables.map((table) =>
          table.name === selectedTable
            ? { ...table, info: newTableInfo }
            : table
        )
      );

      setIsEditingInfo(false);

      showMessage("Informazioni tavolo aggiornate con successo.");
    } catch (error) {
      console.error("Errore nell'aggiornamento delle info del tavolo:", error);
      alert(
        "Si è verificato un errore nell'aggiornamento delle info del tavolo. Riprova."
      );
    }
  };

  return (
    // Applica i gestori di swipe al contenitore principale
    <div
      {...handlers}
      className="flex flex-col md:flex-row h-screen bg-gray-800 relative"
    >
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-700">
        <div className="flex justify-between">
          <button
            className={`flex-1 py-2 ${
              activeSection === "tables" ? "bg-blue-500" : "bg-gray-600"
            }`}
            onClick={() => setActiveSection("tables")}
          >
            Tavoli
          </button>
          <button
            className={`flex-1 py-2 ${
              activeSection === "menu" ? "bg-blue-500" : "bg-gray-600"
            }`}
            onClick={() => setActiveSection("menu")}
          >
            Menu
          </button>
          <button
            className={`flex-1 py-2 ${
              activeSection === "orders" ? "bg-blue-500" : "bg-gray-600"
            }`}
            onClick={() => setActiveSection("orders")}
          >
            Ordini
          </button>
        </div>
      </div>
      {isSessionActive ? (
        <>
          <div
            className={`w-full md:w-1/3 p-4 overflow-y-auto h-[99%] ${
              activeSection !== "tables" ? "hidden md:block" : ""
            }`}
          >
            <h2 className="text-2xl font-bold mb-4 text-white">Tavoli</h2>
            <div className="space-y-2">
              {!isEditingOrder ? (
                tables.map((table) => {
                  const tableTotal = orders[table.name]
                    ? orders[table.name]
                        .reduce(
                          (total, item) => total + item.price * item.quantity,
                          0
                        )
                        .toFixed(2)
                    : "0.00";

                  return (
                    <button
                      key={table.name}
                      className={`block w-full p-2 text-left rounded-lg shadow-md transform transition-transform duration-200 font-bold ${
                        selectedTable === table.name
                          ? "bg-yellow-500 text-white scale-105"
                          : orders[table.name]?.length > 0
                          ? "bg-red-500 text-white"
                          : "bg-green-500 text-white"
                      } hover:scale-105`}
                      onClick={() => {
                        setSelectedTable(table.name);
                        setIsEditingOrder(true);
                      }}
                      disabled={!isSessionActive}
                    >
                      <div className="flex justify-between items-center">
                        <span>
                          {table.name}
                          {table.info && (
                            <span className="ml-2 text-sm">({table.info})</span>
                          )}
                        </span>
                        <span className="text-lg">€{tableTotal}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 bg-blue-500 text-white rounded-lg shadow-md font-bold text-center">
                  <p>Stiamo servendo il tavolo: {selectedTable}</p>
                  {currentTable && (
                    <>
                      {isEditingInfo ? (
                        <div>
                          <input
                            type="text"
                            value={newTableInfo}
                            onChange={(e) => setNewTableInfo(e.target.value)}
                            className="bg-white text-black px-2 py-1 rounded w-full mb-2"
                            disabled={!isSessionActive}
                          />
                          <div className="flex justify-center space-x-2">
                            <button
                              onClick={handleSaveTableInfo}
                              className="bg-green-500 text-white px-4 py-2 rounded"
                              disabled={!isSessionActive}
                            >
                              Salva
                            </button>
                            <button
                              onClick={() => setIsEditingInfo(false)}
                              className="bg-gray-500 text-white px-4 py-2 rounded"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p>
                            {currentTable.info ||
                              "Nessuna informazione disponibile."}
                          </p>
                          <button
                            onClick={() => {
                              setIsEditingInfo(true);
                              setNewTableInfo(currentTable.info || "");
                            }}
                            className="bg-yellow-500 text-white px-4 py-2 rounded mt-2"
                            disabled={!isSessionActive}
                          >
                            Modifica Info
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  <div className="mt-6">
                    <h3 className="text-2xl font-bold mb-2">Totale Ordine</h3>
                    <p className="text-4xl font-bold">
                      €
                      {orders[selectedTable]
                        ? orders[selectedTable]
                            .reduce(
                              (total, item) =>
                                total + item.price * item.quantity,
                              0
                            )
                            .toFixed(2)
                        : "0.00"}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {!isEditingOrder ? (
              <button
                className="w-full p-2 bg-blue-500 text-white mt-4 rounded-lg hover:bg-blue-600 transition-colors font-bold"
                onClick={() => setShowTableManagement(true)}
                disabled={!isSessionActive || isEditingOrder}
              >
                Modifica Tavoli
              </button>
            ) : (
              <>
                {/* Pulsanti sempre visibili */}
                <button
                  className={`w-full p-2 text-white mt-2 rounded-lg font-bold ${
                    isSessionActive && selectedTable && !isSaving
                      ? "bg-green-500 hover:bg-green-600 transition-colors"
                      : "bg-gray-400"
                  }`}
                  onClick={handleConfirmOrder}
                  disabled={!isSessionActive || !selectedTable || isSaving}
                >
                  Conferma Ordine
                </button>
                <button
                  className={`w-full p-2 text-white mt-2 rounded-lg font-bold ${
                    isSessionActive
                      ? "bg-yellow-500 hover:bg-yellow-600 transition-colors"
                      : "bg-gray-400"
                  }`}
                  onClick={handleShowCurrentOrder}
                  disabled={!isSessionActive}
                >
                  Mostra Ordine Corrente
                </button>
                <button
                  className={`w-full p-2 rounded-lg text-white mt-2 font-bold ${
                    isSessionActive
                      ? "bg-green-500 hover:bg-green-600 transition-colors"
                      : "bg-gray-400"
                  }`}
                  onClick={handlePayment}
                  disabled={!isSessionActive}
                >
                  Paga e Libera Tavolo
                </button>
              </>
            )}
          </div>

          <div
            className={`w-full md:w-1/3 p-4 overflow-y-auto h-[99%] ${
              activeSection !== "menu" ? "hidden md:block" : ""
            }`}
          >
            <h2 className="text-2xl font-bold mb-4 text-white">{t("Menu")}</h2>
            {Object.entries(menu).map(([category, items]) => (
              <div key={category} className="mb-4">
                <button
                  className="w-full text-left font-bold text-xl bg-gray-700 text-white p-2 rounded-lg hover:bg-gray-600 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  {category}
                </button>
                {expandedCategory === category && (
                  <div className="mt-2">
                    {items.map((item, index) => (
                      <div
                        key={`${category}-${item.name}-${index}`}
                        className="flex items-center mb-2 bg-blue-500 text-white p-2 rounded-lg shadow-md font-bold"
                      >
                        <button
                          className="bg-red-500 text-white w-8 h-8 rounded-full hover:bg-red-600 transition-colors font-bold"
                          onClick={() => handleOrderChange(category, item, -1)}
                          disabled={!isSessionActive}
                        >
                          -
                        </button>
                        <span className="mx-4">
                          {orders[selectedTable]?.find(
                            (orderItem) => orderItem.name === item.name
                          )?.quantity || 0}
                        </span>
                        <button
                          className="bg-green-500 text-white w-8 h-8 rounded-full hover:bg-green-600 transition-colors font-bold"
                          onClick={() => handleAddItem(category, item)}
                          disabled={!isSessionActive || isSaving}
                        >
                          +
                        </button>
                        <span className="ml-4">
                          {item.name} - €{item.price.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button
              className="w-full p-2 bg-blue-500 text-white mt-4 rounded-lg hover:bg-blue-600 transition-colors font-bold"
              onClick={() => setShowMenuManagement(true)}
              disabled={!isSessionActive}
            >
              Gestisci Menu
            </button>
          </div>
        </>
      ) : null}

      <div
        className={`w-full md:w-1/3 p-4 overflow-y-auto h-[99%] ${
          activeSection !== "orders" ? "hidden md:block" : ""
        }`}
      >
        <div className="flex-grow overflow-y-auto">
          <h2 className="text-2xl font-bold mb-4 text-white">Ordini</h2>
          {selectedTable && orders[selectedTable] && (
            <div>
              {/* Visualizzazione degli ordini */}
              {orders[selectedTable]
                ?.slice()
                .reverse()
                .map((item, index) => (
                  <div
                    key={item.id} // Usa item.id come chiave univoca
                    className="mb-4 bg-red-500 text-white p-2 rounded-lg shadow-lg font-bold"
                  >
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const updatedOrders = { ...orders };
                        const tableOrder = updatedOrders[selectedTable] || [];
                        const itemIndex = tableOrder.findIndex(
                          (orderItem) => orderItem.id === item.id
                        );
                        if (itemIndex > -1) {
                          tableOrder[itemIndex] = {
                            ...tableOrder[itemIndex],
                            name: e.target.value,
                            modified: true, // Imposta modified a true
                          };
                          updatedOrders[selectedTable] = tableOrder;
                          setOrders(updatedOrders);
                          saveOrderToDatabase(selectedTable, tableOrder);
                        }
                      }}
                      className="bg-white text-black px-2 py-1 rounded w-full mb-2"
                      disabled={!isSessionActive}
                    />
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <span className="mr-2">Qt.</span>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const quantity = parseInt(e.target.value) || 0;
                            handleOrderChange(
                              null,
                              item,
                              quantity - item.quantity
                            );
                          }}
                          min="1"
                          className="bg-white text-black px-2 py-1 rounded w-16"
                          disabled={!isSessionActive}
                        />
                      </div>
                      <div className="flex items-center">
                        <span className="mr-2">€</span>
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => {
                            const price = parseFloat(e.target.value) || 0;
                            handleOrderChange(null, item, 0, price);
                          }}
                          step="0.01"
                          className="bg-white text-black px-2 py-1 rounded w-16"
                          disabled={!isSessionActive}
                        />
                      </div>
                    </div>
                  </div>
                ))}

              <div className="mt-4 font-bold text-white">
                Totale: €
                {orders[selectedTable]
                  .reduce(
                    (total, item) => total + item.price * item.quantity,
                    0
                  )
                  .toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {!isEditingOrder && (
          <>
            <button
              className="w-full p-2 bg-purple-500 text-white mt-2 rounded-lg hover:bg-purple-600 transition-colors font-bold"
              onClick={() => setShowReceiptViewer(true)}
            >
              Visualizza Scontrini
            </button>
            <button
              className={`w-full p-2 rounded-lg text-white mt-2 font-bold ${
                !isSessionActive
                  ? "bg-green-500 hover:bg-green-600 transition-colors"
                  : "bg-gray-400"
              }`}
              onClick={handleStartSession}
              disabled={isSessionActive}
            >
              START
            </button>
            <button
              onClick={() => setShowEndSessionModal(true)}
              disabled={!isSessionActive || hasOpenTables}
              className={`w-full p-2 rounded-lg text-white mt-2 font-bold ${
                isSessionActive && !hasOpenTables
                  ? "bg-red-500 hover:bg-red-600 transition-colors"
                  : "bg-gray-400"
              }`}
            >
              END
            </button>
            <button
              onClick={handleCashControl}
              className="w-full p-2 bg-blue-500 text-white mt-2 rounded-lg hover:bg-blue-600 transition-colors font-bold"
            >
              Controllo Cassa
            </button>
            <button
              className={`w-full p-2 mt-2 rounded-lg font-bold ${
                isSessionActive
                  ? "bg-purple-500 text-white hover:bg-purple-600 transition-colors"
                  : "bg-gray-400 text-gray-700"
              }`}
              onClick={() => setShowRefund(true)}
              disabled={!isSessionActive}
            >
              Rimborso
            </button>
          </>
        )}
      </div>

      {/* Modal per il Controllo Cassa */}
      {showCashControlModal && cashControlData && (
        <CashControlModal
          data={cashControlData}
          onClose={() => setShowCashControlModal(false)}
        />
      )}

      {showTableManagement && (
        <TableManagementView
          tables={tables}
          onUpdateTables={handleUpdateTables}
          onClose={() => setShowTableManagement(false)}
        />
      )}

      {showInfoMessage && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-white text-black px-6 py-3 rounded-lg shadow-lg text-lg font-bold border border-gray-300">
            {infoMessage}
          </div>
        </div>
      )}

      {showMenuManagement && (
        <MenuManagementView
          menu={menu}
          onUpdateMenu={handleUpdateMenu}
          onClose={() => setShowMenuManagement(false)}
        />
      )}

      {autosaveMessage && (
        <div className="fixed top-0 left-0 w-full bg-yellow-500 text-white text-center py-2 z-50">
          AUTOSAVE in corso...
        </div>
      )}

      {showPayment && selectedTable && (
        <PaymentView
          order={orders[selectedTable] || []}
          tableName={selectedTable}
          onClose={() => setShowPayment(false)}
          onConfirmPayment={handleConfirmPayment}
        />
      )}

      {showReceiptViewer && (
        <ReceiptViewer onClose={() => setShowReceiptViewer(false)} />
      )}

      {showEndSessionModal && (
        <EndSessionModal
          onClose={() => setShowEndSessionModal(false)}
          onConfirm={handleConfirmEndSession}
        />
      )}

      {showRefund && (
        <RefundModal
          onClose={() => setShowRefund(false)}
          onConfirm={handleConfirmRefund}
        />
      )}

      {showCurrentOrderModal && selectedTable && (
        <CurrentOrderModal
          order={orders[selectedTable] || []}
          tableName={selectedTable}
          onClose={() => setShowCurrentOrderModal(false)}
        />
      )}
    </div>
  );
};

// Modal per confermare la chiusura della sessione
const EndSessionModal = ({ onClose, onConfirm }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-75">
    <div className="bg-white p-4 rounded shadow-md w-1/3">
      <h2 className="text-xl font-bold mb-4">Conferma Chiusura Cassa</h2>
      <p className="mb-4">
        Stai per chiudere la cassa. Tutte le operazioni e informazioni in corso
        saranno cancellate. Sei sicuro di voler procedere?
      </p>
      <div className="flex justify-end">
        <button
          className="mr-2 p-2 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors font-bold"
          onClick={onClose}
        >
          Annulla
        </button>
        <button
          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-bold"
          onClick={onConfirm}
        >
          OK
        </button>
      </div>
    </div>
  </div>
);

const RefundModal = ({ onClose, onConfirm }) => {
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDescription, setRefundDescription] = useState("");

  const handleConfirm = () => {
    if (parseFloat(refundAmount) >= 0) {
      alert("Il valore del rimborso deve essere negativo.");
      return;
    }
    onConfirm(refundAmount, refundDescription);
  };

  const handleChangeAmount = (e) => {
    const value = -Math.abs(parseFloat(e.target.value) || 0);
    setRefundAmount(value);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-75">
      <div className="bg-white p-4 rounded shadow-md w-1/3">
        <h2 className="text-xl font-bold mb-4 text-black">Rimborso Cliente</h2>
        <div className="mb-4">
          <label className="block text-black">Importo:</label>
          <input
            type="number"
            value={refundAmount}
            onChange={handleChangeAmount}
            className="w-full p-2 border border-red-500 rounded"
            autoFocus
          />
        </div>
        <div className="mb-4">
          <label className="block text-black">Descrizione:</label>
          <input
            type="text"
            value={refundDescription}
            onChange={(e) => setRefundDescription(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        <div className="flex justify-end">
          <button
            className="mr-2 p-2 bg-gray-400 text-white rounded hover:bg-gray-500 transition-colors font-bold"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-bold"
            onClick={handleConfirm}
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
};

const CurrentOrderModal = ({ order, tableName, onClose }) => {
  const totalAmount = order.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-xl">
          <div className="px-4 py-3 border-b">
            <h2 className="text-xl font-bold text-gray-800">
              Ordine Corrente - Tavolo {tableName}
            </h2>
          </div>
          <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Articolo
                  </th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                    Qt.
                  </th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    Prezzo
                  </th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    Totale
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {order.map((item, index) => (
                  <tr key={index}>
                    <td className="px-2 py-2 text-sm text-gray-900 break-words">
                      {item.name}
                    </td>
                    <td className="px-2 py-2 text-sm text-right text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="px-2 py-2 text-sm text-right text-gray-900">
                      €{item.price.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-sm text-right text-gray-900">
                      €{(item.price * item.quantity).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-gray-800">
                Totale: €{totalAmount.toFixed(2)}
              </span>
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                onClick={onClose}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestaurantCashRegister;
