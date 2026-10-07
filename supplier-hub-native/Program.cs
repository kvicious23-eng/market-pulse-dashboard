using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;

public sealed class StoredCredential {
    public string Username;
    public string Password;
    public string Version;
}

public static class SupplierVault {
    public const string Target = "MarketPulse.SupplierHub";
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    private struct Credential {
        public uint Flags, Type;
        public string TargetName, Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist, AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias, UserName;
    }
    [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool CredWrite(ref Credential credential, uint flags);
    [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool CredDelete(string target, uint type, uint flags);
    [DllImport("advapi32.dll")] private static extern void CredFree(IntPtr buffer);
    public static StoredCredential Read(string target) {
        IntPtr ptr;
        if(!CredRead(target,1,0,out ptr)) {
            if(Marshal.GetLastWin32Error()==1168) return null;
            throw new InvalidOperationException("credential_read_failed");
        }
        try {
            Credential c=(Credential)Marshal.PtrToStructure(ptr,typeof(Credential));
            return new StoredCredential { Username=c.UserName,Password=Marshal.PtrToStringUni(c.CredentialBlob,(int)c.CredentialBlobSize/2),Version=c.Comment };
        } finally { CredFree(ptr); }
    }
    public static string Write(string target,string username,string password) {
        if(String.IsNullOrWhiteSpace(username)||String.IsNullOrEmpty(password)||password.Length>2560) throw new InvalidOperationException("invalid_credentials");
        byte[] bytes=Encoding.Unicode.GetBytes(password); IntPtr blob=Marshal.AllocHGlobal(bytes.Length);
        string version=Guid.NewGuid().ToString("N");
        try {
            Marshal.Copy(bytes,0,blob,bytes.Length);
            Credential c=new Credential {Type=1,TargetName=target,Comment=version,CredentialBlobSize=(uint)bytes.Length,CredentialBlob=blob,Persist=2,UserName=username};
            if(!CredWrite(ref c,0)) throw new InvalidOperationException("credential_write_failed");
            return version;
        } finally {
            for(int i=0;i<bytes.Length;i++) Marshal.WriteByte(blob,i,0);
            Array.Clear(bytes,0,bytes.Length); Marshal.FreeHGlobal(blob);
        }
    }
    public static void Delete(string target) {
        if(!CredDelete(target,1,0)&&Marshal.GetLastWin32Error()!=1168) throw new InvalidOperationException("credential_delete_failed");
    }
}

public static class SupplierHost {
    private const string AllowedOrigin = "__EXTENSION_ORIGIN__";
    private const string AutomationScript = "__AUTOMATION_SCRIPT__";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    [STAThread]
    public static int Main(string[] args) {
        if(args.Length==1&&args[0]=="--configure") { Configure(); return 0; }
        if(args.Length==1&&args[0]=="--self-test") return SelfTest();
        if(args.Length==0||args[0]!=AllowedOrigin) return 2;
        try {
            using(Stream input=Console.OpenStandardInput()) using(Stream output=Console.OpenStandardOutput()) {
                Dictionary<string,object> request=ReadFrame(input);
                object result;
                try { result=Dispatch(request); } catch { result=new {ok=false,reason="local_credentials_error"}; }
                WriteFrame(output,result);
            }
            return 0;
        } catch(Exception error) { Console.Error.WriteLine("native_protocol_error:"+error.GetType().Name); return 3; }
    }
    public static Dictionary<string,object> ReadFrame(Stream input) {
        byte[] size=new byte[4]; ReadExact(input,size);
        uint length=BitConverter.ToUInt32(size,0);
        if(length==0||length>4096) throw new InvalidDataException("invalid_message");
        byte[] payload=new byte[(int)length];ReadExact(input,payload);
        try { return Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(payload)); }
        finally { Array.Clear(payload,0,payload.Length); }
    }
    private static void ReadExact(Stream input,byte[] buffer) {
        int offset=0; while(offset<buffer.Length) {int n=input.Read(buffer,offset,buffer.Length-offset);if(n==0)throw new EndOfStreamException();offset+=n;}
    }
    public static void WriteFrame(Stream output,object result) {
        byte[] payload=Encoding.UTF8.GetBytes(Json.Serialize(result));
        try { byte[] size=BitConverter.GetBytes((uint)payload.Length);output.Write(size,0,4);output.Write(payload,0,payload.Length);output.Flush(); }
        finally { Array.Clear(payload,0,payload.Length); }
    }
    private static object Dispatch(Dictionary<string,object> request) {
        object op; if(request==null||!request.TryGetValue("operation",out op)) return new {ok=false,reason="invalid_operation"};
        string operation=op as string;
        if(operation=="morning_status"||operation=="csv_complete"||operation=="daily_status") {
            try {return DailyBridge(request);} catch {return new {ok=false,reason="daily_bridge_failed"};}
        }
        if(operation=="configure") {
            Process.Start(new ProcessStartInfo {FileName=System.Reflection.Assembly.GetExecutingAssembly().Location,Arguments="--configure",UseShellExecute=true});
            return new {ok=true};
        }
        if(operation=="delete") {SupplierVault.Delete(SupplierVault.Target);return new {ok=true};}
        if(operation!="status"&&operation!="read") return new {ok=false,reason="invalid_operation"};
        StoredCredential c=SupplierVault.Read(SupplierVault.Target);
        if(c==null) return new {ok=true,configured=false};
        try {
            if(operation=="read") return new {ok=true,configured=true,username=c.Username,password=c.Password,version=c.Version};
            return new {ok=true,configured=true,version=c.Version};
        } finally {c.Password=null;c.Username=null;}
    }
    private static object DailyBridge(Dictionary<string,object> request) {
        if(!File.Exists(AutomationScript)) return new {ok=false,reason="daily_bridge_not_installed"};
        // The executable selects the script. Requests cannot choose a program or
        // shell expression; JSON is carried as one base64 argument.
        string encoded=Convert.ToBase64String(Encoding.UTF8.GetBytes(Json.Serialize(request)));
        ProcessStartInfo start=new ProcessStartInfo {
            FileName=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe"),
            Arguments="-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+AutomationScript+"\" -RequestBase64 "+encoded,
            UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,
            StandardOutputEncoding=Encoding.UTF8
        };
        using(Process process=new Process {StartInfo=start}) {
            process.Start();var output=process.StandardOutput.ReadToEndAsync();var errors=process.StandardError.ReadToEndAsync();
            if(!process.WaitForExit(12000)) {process.Kill();return new {ok=false,reason="daily_bridge_timeout"};}
            if(process.ExitCode!=0) return new {ok=false,reason="daily_bridge_failed"};
            string text=output.Result;if(text.Length>8192)return new {ok=false,reason="daily_bridge_failed"};
            Dictionary<string,object> result=Json.Deserialize<Dictionary<string,object>>(text);
            Dictionary<string,object> safe=new Dictionary<string,object>();
            foreach(string key in new[]{"ok","ready","version","source","runId","scanSlot","day","completedAt","status","reason","attempts","checkedAt","asOfDate","monthThrough"}) {
                object value;if(result.TryGetValue(key,out value)&&(value==null||value is string||value is bool||value is int))safe[key]=value;
            }
            return safe;
        }
    }
    private static void Configure() {
        Application.EnableVisualStyles();
        using(Form form=new Form {Text="Market Pulse · Supplier Hub 계정",ClientSize=new Size(540,340),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,StartPosition=FormStartPosition.CenterScreen}) {
            Label title=new Label {Text="Supplier Hub 공식 로그인용 계정",Left=24,Top=22,Width=480,Height=28,Font=new Font("Malgun Gothic",13,FontStyle.Bold)};
            Label note=new Label {Text="이 PC의 Windows 자격 증명 관리자에 저장돼.\nSupplier Hub 확장에서 공식 로그인 화면에만 사용해.",Left=24,Top=58,Width=480,Height=44};
            Label accountLabel=new Label {Text="아이디",Left=24,Top=126,Width=90};
            TextBox account=new TextBox {Left=120,Top=122,Width=380};
            Label passwordLabel=new Label {Text="비밀번호",Left=24,Top=171,Width=90};
            TextBox password=new TextBox {Left=120,Top=167,Width=380,UseSystemPasswordChar=true};
            Label message=new Label {Left=24,Top=216,Width=480,Height=42};
            Button save=new Button {Text="저장 / 변경",Left=280,Top=280,Width=110,Height=32};
            Button cancel=new Button {Text="닫기",Left=400,Top=280,Width=100,Height=32};
            try {StoredCredential old=SupplierVault.Read(SupplierVault.Target);if(old!=null){account.Text=old.Username;old.Password=null;old.Username=null;}} catch {message.Text="저장 계정을 읽지 못했어. Windows 사용자 계정을 확인해줘.";}
            save.Click+=(sender,e)=>{try{SupplierVault.Write(SupplierVault.Target,account.Text.Trim(),password.Text);password.Clear();message.Text="저장했어. 확장 관리 화면에서 연결 확인을 눌러줘.";}catch{password.Clear();message.Text="저장하지 못했어. 아이디·비밀번호와 Windows 계정을 확인해줘.";}};
            cancel.Click+=(sender,e)=>form.Close();
            form.Controls.AddRange(new Control[]{title,note,accountLabel,account,passwordLabel,password,message,save,cancel});
            form.AcceptButton=save;form.CancelButton=cancel;Application.Run(form);password.Clear();
        }
    }
    private static int SelfTest() {
        string target="MarketPulse.SupplierHub.Test."+Guid.NewGuid().ToString("N");
        try {
            string v=SupplierVault.Write(target,"test-user","test-password-1");
            StoredCredential a=SupplierVault.Read(target);
            if(a==null||a.Username!="test-user"||a.Password!="test-password-1"||a.Version!=v) return 10;
            string v2=SupplierVault.Write(target,"test-user","test-password-2");
            StoredCredential b=SupplierVault.Read(target);
            if(b.Password!="test-password-2"||v==v2) return 11;
            SupplierVault.Delete(target);if(SupplierVault.Read(target)!=null) return 12;
            using(MemoryStream stream=new MemoryStream()) {WriteFrame(stream,new Dictionary<string,object>{{"operation","status"}});stream.Position=0;if((string)ReadFrame(stream)["operation"]!="status")return 13;}
            using(MemoryStream stream=new MemoryStream(new byte[]{255,255,255,127})) {try{ReadFrame(stream);return 14;}catch(InvalidDataException){}}
            return 0;
        } finally {SupplierVault.Delete(target);}
    }
}
