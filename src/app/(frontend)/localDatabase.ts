export type StoredAppState = {
  currentListId: string
  concepts: Array<{
    label: string
    validated: boolean
  }>
}

export type StoredMemory = {
  id: string
  listId: string
  image: Blob
  concepts: string[]
  createdAt: number
  city: string
}

const databaseName = "sensory-anchoring"
const databaseVersion = 1
const stateStore = "app-state"
const memoryStore = "memories"

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(stateStore)) {
        database.createObjectStore(stateStore)
      }
      if (!database.objectStoreNames.contains(memoryStore)) {
        database.createObjectStore(memoryStore, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionComplete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

export const loadLocalData = async () => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(
      [stateStore, memoryStore],
      "readonly",
    )
    const complete = transactionComplete(transaction)
    const state = requestResult<StoredAppState | undefined>(
      transaction.objectStore(stateStore).get("current"),
    )
    const memories = requestResult<StoredMemory[]>(
      transaction.objectStore(memoryStore).getAll(),
    )
    const result = await Promise.all([state, memories])
    await complete
    return { state: result[0], memories: result[1] }
  } finally {
    database.close()
  }
}

export const saveAppState = async (state: StoredAppState) => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(stateStore, "readwrite")
    const complete = transactionComplete(transaction)
    transaction.objectStore(stateStore).put(state, "current")
    await complete
  } finally {
    database.close()
  }
}

export const saveMemory = async (memory: StoredMemory) => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(memoryStore, "readwrite")
    const complete = transactionComplete(transaction)
    transaction.objectStore(memoryStore).put(memory)
    await complete
  } finally {
    database.close()
  }
}

export const updateMemoryCity = async (id: string, city: string) => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(memoryStore, "readwrite")
    const complete = transactionComplete(transaction)
    const store = transaction.objectStore(memoryStore)
    const request = store.get(id)
    request.onsuccess = () => {
      const memory = request.result as StoredMemory | undefined
      if (memory) store.put({ ...memory, city })
    }
    await complete
  } finally {
    database.close()
  }
}

export const removeMemory = async (id: string) => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(memoryStore, "readwrite")
    const complete = transactionComplete(transaction)
    transaction.objectStore(memoryStore).delete(id)
    await complete
  } finally {
    database.close()
  }
}
