import { supabase } from "../services/supabase";

function AddMember() {

  async function uploadFile(file) {
    const { data, error } = await supabase.storage
      .from("uploads")
      .upload(`documents/${file.name}`, file);

    console.log(data, error);
  }

  return (
    <div>
      <h2>Add Member</h2>

      <input
        type="file"
        onChange={(e) => uploadFile(e.target.files[0])}
      />
    </div>
  );
}

export default AddMember;