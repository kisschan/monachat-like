import { Account } from "../entity/account";
import { ClientInfo } from "../entity/clientInfo";
import { UserPresenter } from "./userPresenter";
import {
  IAccountRepository,
  IClientCommunicator,
  IServerCommunicator,
  ISystemReceivedLogger,
} from "./userPresenterInterfaces";
import { HashTripper, Tripper } from "../domain/tripper";
import { IDGeneratable } from "../domain/idGenerator";
import { Avatar } from "../domain/avatar";
import { CharType } from "../domain/charType";
import { Name } from "../domain/name";
import { Color } from "../domain/color";
import { WhiteTrip } from "../domain/trip";
import { IP } from "../domain/ip";
import { Position } from "../domain/position";
import { Direction, DirectionValue } from "../domain/direction";
import { Status } from "../domain/status";
import { Character } from "../domain/character";

let presenter: UserPresenter;
let client: IClientCommunicator;
let server: IServerCommunicator;
let accountRep: IAccountRepository;
let systemLogger: ISystemReceivedLogger;
let whiteTripper: Tripper;
let blackTripper: Tripper;

const avatarData = new Avatar({
  name: new Name("田中太郎"),
  charType: new CharType("unknown2"),
  charColor: Color.instantiateByMona({ r: 50, g: 50, b: 50 }),
  blackTrip: undefined,
  whiteTrip: new WhiteTrip(new IP("000.111.222.333"), new HashTripper("")),
});

const clientInfo: ClientInfo = {
  socketId: "hogehoge",
  ipAddress: "127.0.0.1",
  isMobile: true,
};

const ServerMock = vi.fn().mockImplementation(() => {
  return {
    sendCOM: vi.fn(),
    sendENTER: vi.fn(),
    sendSET: vi.fn(),
    sendIG: vi.fn(),
    sendEXIT: vi.fn(),
    sendSLEEP: vi.fn(),
    sendAWAKE: vi.fn(),
    sendCOUNT: vi.fn(),
    sendUsers: vi.fn(),
  };
});

const ClientMock = vi.fn().mockImplementation(() => {
  return {
    update: vi.fn(),
    sendUsers: vi.fn(),
    sendAuth: vi.fn(),
    moveRoom: vi.fn(),
    disconnect: vi.fn(),
  };
});

const IDGeneratorMock = vi.fn().mockImplementation(() => {
  return {
    generate: vi.fn().mockReturnValueOnce("id").mockReturnValueOnce("token"),
  };
});

const AccountRepositoryMock = vi.fn().mockImplementation(() => {
  const account = Account.instantiate({
    idGenerator: new IDGeneratorMock(),
    socketId: "00",
  });
  account.character = new Character()
    .updateAvatar(avatarData.copy())
    .moveRoom("/1");
  account.lastCommentTime = new Date(2000, 0, 0);
  return {
    getAccountBySocketId: vi.fn().mockReturnValue(account),
    getAccountByToken: vi.fn().mockReturnValue(account),
    fetchUsers: vi.fn().mockReturnValue([{ id: "1" }, { id: "2" }]),
    fetchUser: vi.fn().mockReturnValue({
      id: "id",
      room: "/MONA8094",
      x: 100,
      y: 100,
      scl: 100,
      stat: "通常",
      name: "名無しさん",
      ihash: "ABCDE12346",
      trip: "hoge2Trip",
      r: 70,
      g: 55,
      b: 60,
      type: "mona",
      isMobile: true,
    }),
    getRooms: vi.fn().mockReturnValue([{ c: 1, n: "/1" }]),
    countSameIhash: vi.fn().mockReturnValue(1),
    isPermittedToEnter: vi.fn().mockReturnValue(true),
    getBannedIhashes: vi.fn().mockReturnValue(["BANIHASH"]),
    create: vi.fn().mockReturnValue(account),
    updateSocketIdWithValidToken: vi.fn(),
    updateAlive: vi.fn(),
    updateIsMobile: vi.fn(),
    updateLastCommentTime: vi.fn(),
    updateCharacter: vi.fn(),
    speak: vi.fn().mockReturnValue(true),
  };
});

const SystemLoggerMock = vi.fn().mockImplementation(() => {
  return {
    logReceivedConnection: vi.fn(),
    logReceivedCOM: vi.fn(),
    logReceivedENTER: vi.fn(),
    logReceivedEXIT: vi.fn(),
    logReceivedSET: vi.fn(),
    logReceivedIG: vi.fn(),
    logReceivedAUTH: vi.fn(),
    logReceivedERROR: vi.fn(),
    logReceivedSUICIDE: vi.fn(),
    logReceivedDisconnect: vi.fn(),
    logReceivedParseError: vi.fn(),
  };
});

const WhiteTripperMock = vi.fn().mockImplementation(() => {
  return {
    execute: vi.fn().mockReturnValue("hogeWhiteTrip"),
  };
});
const WhiteTripperMockBANUser = vi.fn().mockImplementation(() => {
  return {
    execute: vi.fn().mockReturnValue("BANIHASH"),
  };
});

const BlackTripperMock = vi.fn().mockImplementation(() => {
  return {
    execute: vi.fn().mockReturnValue("hogeBlackTrip"),
  };
});

beforeEach(() => {
  server = new ServerMock();
  client = new ClientMock();
  accountRep = new AccountRepositoryMock();
  systemLogger = new SystemLoggerMock();
  whiteTripper = new WhiteTripperMock();
  blackTripper = new BlackTripperMock();
  presenter = new UserPresenter({
    client: client,
    server: server,
    accountRep: accountRep,
    systemLogger: systemLogger,
    whiteTripper: whiteTripper,
    blackTripper: blackTripper,
  });
});

describe("#receivedConnection", () => {
  it("normal case", () => {
    presenter.receivedConnection(clientInfo);
    expect(systemLogger.logReceivedConnection).toBeCalledTimes(1);
  });
});

describe("#receivedCOM", () => {
  it("normal case", () => {
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "こんにちは",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedCOM).toBeCalledTimes(1);
    expect(server.sendCOM).toBeCalledTimes(1);
    expect(server.sendCOM).toBeCalledWith(
      {
        id: "id",
        cmt: "こんにちは",
      },
      "/1"
    );
  });

  it("normal case: style 2", () => {
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "こんにちは",
        style: 2,
      },
      clientInfo
    );
    expect(systemLogger.logReceivedCOM).toBeCalledTimes(1);
    expect(server.sendCOM).toBeCalledTimes(1);
    expect(server.sendCOM).toBeCalledWith(
      {
        id: "id",
        cmt: "こんにちは",
        style: 2,
      },
      "/1"
    );
  });

  it("should omit extra parameters", () => {
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "こんにちは",
        hoge: "fuga",
      } as any,
      clientInfo
    );
    expect(systemLogger.logReceivedCOM).toBeCalledTimes(1);
    expect(server.sendCOM).toBeCalledTimes(1);
    expect(server.sendCOM).toBeCalledWith(
      {
        id: "id",
        cmt: "こんにちは",
      },
      "/1"
    );
  });

  it("should reauth and send COM info if token is invalid", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    account.character = account.character.moveRoom("/1");
    account.lastCommentTime = new Date(2000, 0, 0);
    accountRep.getAccountBySocketId = vi.fn().mockReturnValue(undefined);
    accountRep.getAccountByToken = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValue(account);
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "こんにちは",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedCOM).toBeCalledTimes(1);
    expect(accountRep.create).toBeCalledTimes(1);
    expect(client.sendAuth).toBeCalledTimes(1);
    expect(client.disconnect).toBeCalledTimes(0);
    expect(server.sendCOM).toBeCalledTimes(1);
    expect(server.sendCOM).toBeCalledWith(
      {
        id: "id",
        cmt: "こんにちは",
      },
      "/1"
    );
  });

  it("should interrupt processing if currentRoom is not found", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    accountRep.getAccountByToken = vi.fn().mockReturnValue(account);
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "こんにちは",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedCOM).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(0);
    expect(server.sendCOM).toBeCalledTimes(0);
  });

  it("should interrupt processing if account is not found", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    accountRep.create = vi.fn().mockReturnValue(account);
    accountRep.getAccountByToken = vi.fn().mockReturnValue(undefined);
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "こんにちは",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedCOM).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(0);
    expect(server.sendCOM).toBeCalledTimes(0);
  });

  it("should delay COM sending if comment interval is too short", async () => {
    // タイマーをモック
    vi.useFakeTimers();

    // 初回の speak 呼び出しでは false を返し、その後の呼び出しで true を返すようにスタブ
    accountRep.speak = vi
      .fn()
      .mockReturnValueOnce(false) // 初回は送信不可
      .mockReturnValueOnce(true); // 遅延後は送信可能

    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    account.character = account.character.moveRoom("/1");
    const now = new Date();
    const milliSecNow = now.getTime();
    // 前回コメント時刻が現在から500ms前なので、まだ800ms未満
    account.lastCommentTime = new Date(milliSecNow - 500);

    accountRep.getAccountByToken = vi.fn().mockReturnValue(account);
    accountRep.getRemainingDelay = vi.fn().mockReturnValue(300);

    // 受信処理を呼び出す
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "こんにちは",
      },
      clientInfo
    );

    // すぐには COM 送信が行われない（遅延中のため）
    expect(systemLogger.logReceivedCOM).toBeCalledTimes(1);
    expect(accountRep.create).toBeCalledTimes(0);
    expect(client.disconnect).toBeCalledTimes(0);
    expect(client.sendAuth).toBeCalledTimes(0);
    expect(server.sendCOM).toBeCalledTimes(0);

    // 残り待機時間は 800ms - 500ms = 300ms のはずなので、300ms 進める
    vi.advanceTimersByTime(300);

    // タイマー処理を全て実行
    await vi.runAllTimersAsync();

    // 遅延後、sendCOM が呼ばれるはず
    expect(server.sendCOM).toBeCalledTimes(1);

    // クリーンアップ：リアルタイマーに戻す
    vi.useRealTimers();
  });

  it("should not send second COM before 800ms interval", async () => {
    vi.useFakeTimers();

    accountRep.speak = vi
      .fn()
      .mockReturnValueOnce(false) // 1つ目COM: 初回チェック
      .mockReturnValueOnce(true) // 1つ目COM: 遅延後チェック
      .mockReturnValueOnce(false) // 2つ目COM: 初回チェック
      .mockReturnValueOnce(true); // 2つ目COM: 遅延後チェック

    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    account.character = account.character.moveRoom("/1");
    const now = new Date();
    const milliSecNow = now.getTime();
    account.lastCommentTime = new Date(milliSecNow - 500);

    accountRep.getAccountByToken = vi.fn().mockReturnValue(account);
    accountRep.getRemainingDelay = vi
      .fn()
      .mockReturnValueOnce(300) // 1つ目COM用: 800-500=300ms
      .mockReturnValueOnce(800); // 2つ目COM用

    // 1つ目のCOMを受信
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "Hello 1",
      },
      clientInfo
    );

    // すぐには送信されないはず
    expect(server.sendCOM).toBeCalledTimes(0);

    // 300ms進めると1つ目のCOMが送信される
    vi.advanceTimersByTime(300);
    expect(server.sendCOM).toBeCalledTimes(1);

    // 1つ目COM送信後、2つ目のCOMをすぐに受信
    presenter.receivedCOM(
      {
        token: "token",
        cmt: "Hello 2",
      },
      clientInfo
    );

    // 500ms進めるだけでは2つ目はまだ送信されないはず
    vi.advanceTimersByTime(500);
    expect(server.sendCOM).toBeCalledTimes(1); // 2つ目は未実行

    // さらに300ms進めると、合計800ms経過し2つ目が送信される
    vi.advanceTimersByTime(300);
    expect(server.sendCOM).toBeCalledTimes(2);

    vi.useRealTimers();
  });
});

describe("#receivedENTER", () => {
  it("normal case enter at entrance", () => {
    presenter.receivedENTER(
      {
        token: "token",
        room: "/MONA8094",
        attrib: "no",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedENTER).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(accountRep.fetchUsers).toBeCalledTimes(1);
    expect(accountRep.getAccountByToken).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledWith("hogeWhiteTrip");
    expect(accountRep.getBannedIhashes).toBeCalledTimes(1);
    expect(accountRep.getBannedIhashes().includes("hogeWhiteTrip")).toBeFalsy();
    expect(client.moveRoom).toBeCalledTimes(1);
    expect(client.moveRoom).toBeCalledWith("/1", "/MONA8094");
    expect(client.sendUsers).toBeCalledTimes(1);
    expect(client.sendUsers).toBeCalledWith([{ id: "1" }, { id: "2" }]);
    expect(server.sendENTER).toBeCalledTimes(1);
    expect(server.sendENTER).toBeCalledWith(
      {
        id: "id",
        room: "/MONA8094",
        x: 100,
        y: 100,
        scl: 100,
        stat: "通常",
        name: "名無しさん",
        ihash: "ABCDE12346",
        trip: "hoge2Trip",
        r: 70,
        g: 55,
        b: 60,
        type: "mona",
        isMobile: true,
      },
      "/MONA8094"
    );
  });

  it("normal case enter at room selection", () => {
    presenter.receivedENTER(
      {
        token: "token",
        room: "/1",
        x: 100,
        y: 100,
        scl: 100,
        stat: "通常",
        name: "名無しさん",
        trip: "UWXYZ67890",
        r: 70,
        g: 55,
        b: 60,
        type: "mona",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedENTER).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(accountRep.fetchUsers).toBeCalledTimes(1);
    expect(accountRep.getAccountByToken).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledWith("hogeWhiteTrip");
    expect(accountRep.getBannedIhashes).toBeCalledTimes(1);
    expect(accountRep.getBannedIhashes().includes("hogeWhiteTrip")).toBeFalsy();
    expect(client.moveRoom).toBeCalledTimes(1);
    expect(client.moveRoom).toBeCalledWith("/1", "/1");
    expect(client.sendUsers).toBeCalledTimes(1);
    expect(client.sendUsers).toBeCalledWith([{ id: "1" }, { id: "2" }]);
    expect(server.sendENTER).toBeCalledTimes(1);
    expect(server.sendENTER).toBeCalledWith(
      {
        id: "id",
        room: "/1",
        x: 100,
        y: 100,
        scl: 100,
        stat: "通常",
        name: "名無しさん",
        ihash: "ABCDE12346",
        trip: "hoge2Trip",
        r: 70,
        g: 55,
        b: 60,
        type: "mona",
        isMobile: true,
      },
      "/1"
    );
  });

  it("banuser enter at room selection", () => {
    whiteTripper = new WhiteTripperMockBANUser();
    presenter = new UserPresenter({
      client: client,
      server: server,
      accountRep: accountRep,
      systemLogger: systemLogger,
      whiteTripper: whiteTripper,
      blackTripper: blackTripper,
    });
    presenter.receivedENTER(
      {
        token: "token",
        room: "/1",
        x: 100,
        y: 100,
        scl: 100,
        stat: "通常",
        name: "名無しさん",
        trip: "UWXYZ67890",
        r: 70,
        g: 55,
        b: 60,
        type: "mona",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedENTER).toBeCalledTimes(1);
    expect(accountRep.getAccountByToken).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledWith("BANIHASH");
    expect(accountRep.getBannedIhashes).toBeCalledTimes(1);
    expect(accountRep.getBannedIhashes().includes("BANIHASH")).toBeTruthy();
    //BANなのでここから以下は呼ばれない
  });

  it("余分なプロパティ", () => {
    const res: any = {
      room: "/MONA8094",
      attrib: "no",
      hoge: "fuga",
    };
    presenter.receivedENTER(res, clientInfo);
    expect(systemLogger.logReceivedENTER).toBeCalledTimes(1);
    expect(server.sendENTER).toBeCalledTimes(1);
    expect(server.sendENTER).toBeCalledWith(
      {
        id: "id",
        room: "/MONA8094",
        x: 100,
        y: 100,
        scl: 100,
        stat: "通常",
        name: "名無しさん",
        ihash: "ABCDE12346",
        trip: "hoge2Trip",
        r: 70,
        g: 55,
        b: 60,
        type: "mona",
        isMobile: true,
      },
      "/MONA8094"
    );
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(accountRep.fetchUsers).toBeCalledTimes(1);
  });

  it("should remake authentication if id is not found", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    account.character = account.character.moveRoom("/1");
    accountRep.getAccountBySocketId = vi.fn().mockReturnValue(undefined);
    accountRep.getAccountByToken = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValue(account);
    presenter.receivedENTER(
      {
        token: "token",
        room: "/MONA8094",
        x: 100,
        y: 100,
        scl: 100,
        stat: "通常",
        name: "名無しさん",
        trip: "UWXYZ67890",
        r: 70,
        g: 55,
        b: 60,
        type: "mona",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedENTER).toBeCalledTimes(1);
    expect(accountRep.create).toBeCalledTimes(1);
    expect(client.sendAuth).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(accountRep.fetchUsers).toBeCalledTimes(1);
    expect(accountRep.getAccountByToken).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledTimes(1);
    expect(accountRep.getBannedIhashes).toBeCalledTimes(1);
    expect(client.moveRoom).toBeCalledTimes(1);
    expect(client.sendUsers).toBeCalledTimes(1);
    expect(server.sendENTER).toBeCalledTimes(1);
  });

  it("should accept if currentRoom is null the first time", () => {
    accountRep.getAccountByToken = vi.fn().mockReturnValue(undefined);
    presenter.receivedENTER(
      {
        token: "token",
        room: "/MONA8094",
        attrib: "no",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedENTER).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(accountRep.fetchUsers).toBeCalledTimes(1);
    expect(accountRep.getAccountByToken).toBeCalledTimes(1);
    expect(accountRep.isPermittedToEnter).toBeCalledTimes(1);
    expect(accountRep.getBannedIhashes).toBeCalledTimes(1);
    expect(client.moveRoom).toBeCalledTimes(1);
    expect(client.sendUsers).toBeCalledTimes(1);
    expect(server.sendENTER).toBeCalledTimes(1);
  });
});

describe("#receviedEXIT", () => {
  it("正常系", () => {
    presenter.receivedEXIT(
      {
        token: "token",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedEXIT).toBeCalledTimes(1);
    expect(client.moveRoom).toBeCalledTimes(1);
    expect(client.moveRoom).toBeCalledWith("/1", "/MONA8094");
  });

  it("正常系 部屋選択画面での退室", () => {});

  it("should remake authentication if id is not found", () => {
    accountRep.getAccountByToken = vi.fn().mockReturnValue(undefined);
    presenter.receivedEXIT(
      {
        token: "token",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedEXIT).toBeCalledTimes(1);
    expect(accountRep.create).toBeCalledTimes(1);
    expect(client.sendAuth).toBeCalledTimes(1);
    expect(server.sendEXIT).toBeCalledTimes(1);
    expect(client.moveRoom).toBeCalledTimes(1);
  });
});

describe("#receivedSET", () => {
  it("正常系", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    account.character = account.character
      .movePosition(Position.instantiate({ x: 50, y: 50 })!)
      .turn(Direction.instantiate(DirectionValue.Right))
      .updateStatus(new Status("通常"))
      .moveRoom("/1");
    const mockAccountValue = account;
    accountRep.getAccountByToken = vi.fn().mockReturnValue(mockAccountValue);
    presenter.receivedSET(
      {
        token: "token",
        x: 50,
        y: 50,
        scl: 100,
        stat: "通常",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedSET).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(server.sendSET).toBeCalledTimes(1);
    expect(server.sendSET).toBeCalledWith(
      {
        id: "id",
        x: 50,
        y: 50,
        scl: 100,
        stat: "通常",
      },
      "/1"
    );
  });

  it("余分なプロパティ", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    account.character = account.character
      .movePosition(Position.instantiate({ x: 50, y: 50 })!)
      .turn(Direction.instantiate(DirectionValue.Right))
      .updateStatus(new Status("通常"))
      .moveRoom("/1");
    const mockAccountValue = account;
    accountRep.getAccountByToken = vi.fn().mockReturnValue(mockAccountValue);
    presenter.receivedSET(
      {
        token: "token",
        x: 50,
        y: 50,
        scl: 100,
        stat: "通常",
        hoge: "fugafuga",
      } as any,
      clientInfo
    );
    expect(systemLogger.logReceivedSET).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(server.sendSET).toBeCalledTimes(1);
    expect(server.sendSET).toBeCalledWith(
      {
        id: "id",
        x: 50,
        y: 50,
        scl: 100,
        stat: "通常",
      },
      "/1"
    );
  });

  it("should remake authentication if id is not found", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    account.character = account.character.moveRoom("/1");
    accountRep.getAccountBySocketId = vi.fn().mockReturnValue(undefined);
    accountRep.getAccountByToken = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValue(account);
    presenter.receivedSET(
      {
        token: "token",
        x: 50,
        y: 50,
        scl: 100,
        stat: "通常",
      },
      clientInfo
    );
    expect(systemLogger.logReceivedSET).toBeCalledTimes(1);
    expect(accountRep.create).toBeCalledTimes(1);
    expect(client.sendAuth).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
    expect(server.sendSET).toBeCalledTimes(1);
  });
});

describe("#receivedIG", () => {
  it("正常系", () => {
    presenter.receivedIG(
      { token: "hogeToken", stat: "on", ihash: "ihash" },
      clientInfo
    );
    expect(server.sendIG).toBeCalledTimes(1);
    // expect(server.sendIG).toBeCalledWith({})
  });
});

describe("#receivedAUTH", () => {
  it("正常系", () => {
    presenter.receivedAUTH({ token: "hogeToken" }, clientInfo);
    expect(accountRep.updateSocketIdWithValidToken).toBeCalledTimes(1);
    expect(server.sendAWAKE).toBeCalledTimes(1);
    expect(server.sendUsers).toBeCalledTimes(1);
  });

  it("should return authentication error if token is invalid", () => {
    accountRep.getAccountByToken = vi.fn().mockReturnValue(undefined);
    presenter.receivedAUTH({ token: "noToken" }, clientInfo);
    expect(client.sendAuth).toBeCalledTimes(1);
    expect(client.sendAuth).toBeCalledWith({ id: "error", token: "noToken" });
    expect(server.sendAWAKE).toBeCalledTimes(0);
    expect(server.sendUsers).toBeCalledTimes(0);
  });
});

describe("#receivedERROR", () => {
  it("正常系", () => {
    presenter.receivedERROR({ text: "text" }, clientInfo);
    expect(systemLogger.logReceivedERROR).toBeCalledTimes(1);
  });
});

describe("#receivedSUICIDE", () => {
  it("正常系", () => {
    presenter.receivedSUICIDE({ token: "token" }, clientInfo);
    expect(systemLogger.logReceivedSUICIDE).toBeCalledTimes(1);
    expect(client.disconnect).toBeCalledTimes(1);
  });
});

describe("#receivedDisconnect", () => {
  it("正常系", () => {
    presenter.receivedDisconnect("server shutting down", clientInfo);
    expect(accountRep.updateAlive).toBeCalledTimes(1);
    expect(server.sendSLEEP).toBeCalledTimes(1);
    expect(systemLogger.logReceivedDisconnect).toBeCalledTimes(1);
    expect(server.sendUsers).toBeCalledTimes(1);
  });

  it("should do nothing if current room is null", () => {
    const account = Account.instantiate({
      idGenerator: new IDGeneratorMock(),
      socketId: "socketId",
    });
    accountRep.getAccountBySocketId = vi.fn().mockReturnValue(account);
    accountRep.getAccountByToken = vi.fn().mockReturnValue(undefined);
    presenter.receivedDisconnect("server shutting down", clientInfo);
    expect(accountRep.updateAlive).toBeCalledTimes(1);
    expect(server.sendSLEEP).toBeCalledTimes(0);
    expect(systemLogger.logReceivedDisconnect).toBeCalledTimes(1);
    expect(server.sendUsers).toBeCalledTimes(0);
  });

  it("should do nothing if id is not found", () => {
    accountRep.getAccountBySocketId = vi.fn().mockReturnValue(undefined);
    presenter.receivedDisconnect("server shutting down", clientInfo);
    expect(systemLogger.logReceivedDisconnect).toBeCalledTimes(1);
    expect(accountRep.updateCharacter).toBeCalledTimes(0);
    expect(server.sendSLEEP).toBeCalledTimes(0);
  });
});

describe("#receivedJoiningRoom", () => {
  it("正常系", () => {
    presenter.completedJoiningRoom("/1", clientInfo);
    expect(accountRep.updateCharacter).toBeCalledTimes(1);
  });

  it("should do nothing if id is not found", () => {
    accountRep.getAccountBySocketId = vi.fn().mockReturnValue(undefined);
    presenter.completedJoiningRoom("/1", clientInfo);
    expect(accountRep.updateCharacter).toBeCalledTimes(0);
  });
});

describe("#receivedParseError", () => {
  it("正常系", () => {
    presenter.receivedParseError("string");
    expect(systemLogger.logReceivedParseError).toBeCalledTimes(1);
  });
});
